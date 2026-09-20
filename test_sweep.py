"""单参数扫描（sweep）冒烟测试（开发用，不打进镜像）。"""
import copy
import math
import sys

from app.solver import CircuitError, SWEEP_POINTS_MAX, solve, sweep

failures = []


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}" + (f"  -> {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(name)


def expect_problem(payload):
    try:
        sweep(payload)
        return None
    except CircuitError as e:
        return e.errors


# 基础分压网络：10V 源，R1=10 与 R2（扫描对象）串联接地
def divider(r2=20.0):
    return {
        "ground": "0",
        "nodes": ["0", "1", "2"],
        "elements": [
            {"id": "V1", "type": "V", "node_p": "1", "node_n": "0", "value": 10},
            {"id": "R1", "type": "R", "node_p": "1", "node_n": "2", "value": 10},
            {"id": "R2", "type": "R", "node_p": "2", "node_n": "0", "value": r2},
        ],
    }


# ---------- 1. 正常扫描：R2: 10→30 三档，V2 = 10*R2/(10+R2) ----------
p = divider()
p["sweep"] = {"element_id": "R2", "start": 10, "stop": 30, "points": 3}
r = sweep(p)
check("扫描成功", r["ok"] is True)
check("采样点数=3", len(r["samples"]) == 3, str(len(r["samples"])))
check("采样值等差", [round(s["param"], 6) for s in r["samples"]] == [10.0, 20.0, 30.0],
      str([s["param"] for s in r["samples"]]))
check("汇总统计", r["summary"] == {"total": 3, "succeeded": 3, "failed": 0}, str(r["summary"]))
for s, r2 in zip(r["samples"], [10.0, 20.0, 30.0]):
    v2 = {x["id"]: x["voltage"] for x in s["node_voltages"]}["2"]
    expect = 10.0 * r2 / (10.0 + r2)
    check(f"R2={r2:g} 时 V2={expect:.4f}", math.isclose(v2, expect, abs_tol=1e-9), str(v2))
    cur = {b["id"]: b["current"] for b in s["branches"]}["R1"]
    check(f"R2={r2:g} 时串联电流={10/(10+r2):.4f}",
          math.isclose(cur, 10.0 / (10.0 + r2), abs_tol=1e-9), str(cur))

# ---------- 2. 反向扫描（止值 < 起值） ----------
p = divider()
p["sweep"] = {"element_id": "R2", "start": 30, "stop": 10, "points": 3}
r = sweep(p)
check("反向扫描采样值", [round(s["param"], 6) for s in r["samples"]] == [30.0, 20.0, 10.0],
      str([s["param"] for s in r["samples"]]))
check("反向扫描全部成功", r["summary"]["failed"] == 0, str(r["summary"]))

# ---------- 3. 扫描不改写原电路表 ----------
p = divider(20.0)
before = copy.deepcopy(p)
p["sweep"] = {"element_id": "R2", "start": 5, "stop": 25, "points": 5}
sweep(p)
check("原电路表未被扫描改写",
      {k: p[k] for k in ("ground", "nodes", "elements")}
      == {k: before[k] for k in ("ground", "nodes", "elements")},
      "payload 在扫描后发生变化")
check("R2 仍为 20", p["elements"][2]["value"] == 20.0, str(p["elements"][2]["value"]))

# ---------- 4. 单点失败不中断：并联理想电压源扫过相等点 -------------------
# V1=12V 与 V2 并联：取值不等 -> voltage_conflict；取值相等 -> 源电流无法
# 唯一分配 -> singular。无论哪种失败，扫描都须逐点保留错误并跑完所有点。
p = {
    "ground": "0",
    "nodes": ["0", "1"],
    "elements": [
        {"id": "V1", "type": "V", "node_p": "1", "node_n": "0", "value": 12},
        {"id": "V2", "type": "V", "node_p": "1", "node_n": "0", "value": 4},
    ],
    "sweep": {"element_id": "V2", "start": 4, "stop": 20, "points": 5},
}
r = sweep(p)
codes = [[g["code"] for g in s["errors"]] if not s["ok"] else [] for s in r["samples"]]
check("全部点都有结论且扫描未中断", len(r["samples"]) == 5)
check("错误逐点保留（冲突/奇异）",
      codes == [["voltage_conflict"], ["voltage_conflict"], ["singular"],
                ["voltage_conflict"], ["voltage_conflict"]],
      str(codes))
check("汇总统计 0 成功 5 失败",
      r["summary"] == {"total": 5, "succeeded": 0, "failed": 5}, str(r["summary"]))
check("失败点仍带参数值",
      [s["param"] for s in r["samples"]] == [4.0, 8.0, 12.0, 16.0, 20.0])
bad = next(s for s in r["samples"] if s["ok"] is False)
check("失败点保留错误结构", bad["errors"][0]["code"] == "voltage_conflict",
      str(bad["errors"][0]["code"]))

# ---------- 4b. 结构问题（浮置子网）在每个点复现但扫描仍完整 ----------
p = {
    "ground": "0",
    "nodes": ["0", "1", "2", "3"],
    "elements": [
        {"id": "V1", "type": "V", "node_p": "1", "node_n": "0", "value": 10},
        {"id": "R1", "type": "R", "node_p": "1", "node_n": "0", "value": 10},
        {"id": "V2", "type": "V", "node_p": "2", "node_n": "3", "value": 5},
        {"id": "R2", "type": "R", "node_p": "2", "node_n": "3", "value": 100},
    ],
    "sweep": {"element_id": "R1", "start": 5, "stop": 50, "points": 5},
}
r = sweep(p)
check("浮置子网逐点失败", all(not s["ok"] for s in r["samples"]))
check("逐点错误码为 floating_subnet",
      all(s["errors"][0]["code"] == "floating_subnet" for s in r["samples"]),
      str([[g["code"] for g in s["errors"]] for s in r["samples"]]))
check("浮置场景汇总", r["summary"] == {"total": 5, "succeeded": 0, "failed": 5})

# ---------- 5. 扫描电流源，取值含负值 ----------
p = {
    "ground": "0",
    "nodes": ["0", "1"],
    "elements": [
        {"id": "I1", "type": "I", "node_p": "1", "node_n": "0", "value": 1},
        {"id": "R1", "type": "R", "node_p": "1", "node_n": "0", "value": 5},
    ],
    "sweep": {"element_id": "I1", "start": -2, "stop": 2, "points": 5},
}
r = sweep(p)
check("电流源负值扫描全成功", r["summary"]["failed"] == 0, str(r["summary"]))
volts = [{x["id"]: x["voltage"] for x in s["node_voltages"]}["1"] for s in r["samples"]]
check("V1=-5*I 线性", all(math.isclose(v, -5 * i, abs_tol=1e-9)
                         for v, i in zip(volts, [-2, -1, 0, 1, 2])), str(volts))

# ---------- 6. 配置校验 ----------
p = divider()
p["sweep"] = {"element_id": "RX", "start": 1, "stop": 10, "points": 5}
errs = expect_problem(p)
check("元件不存在被拒", errs and errs[0]["code"] == "sweep_validation", str(errs))

p = divider()
p["sweep"] = {"element_id": "R2", "start": 5, "stop": 5, "points": 3}
errs = expect_problem(p)
check("起止相同被拒", errs and errs[0]["code"] == "sweep_validation", str(errs))

p = divider()
p["sweep"] = {"element_id": "R2", "start": "x", "stop": 10, "points": 3}
errs = expect_problem(p)
check("起始值非数字被拒", errs and errs[0]["code"] == "sweep_validation", str(errs))

p = divider()
p["sweep"] = {"element_id": "R2", "start": 1, "stop": 10, "points": float("inf")}
errs = expect_problem(p)
check("范围含 inf 被拒", errs and errs[0]["code"] == "sweep_validation", str(errs))

for bad_points in (1, SWEEP_POINTS_MAX + 1, 0, -3, 2.5, "11", True):
    p = divider()
    p["sweep"] = {"element_id": "R2", "start": 1, "stop": 10, "points": bad_points}
    errs = expect_problem(p)
    check(f"非法点数 {bad_points!r} 被拒", errs and errs[0]["code"] == "sweep_validation", str(errs))

p = divider()
p["sweep"] = {"element_id": "R2", "start": 0, "stop": 10, "points": 5}
errs = expect_problem(p)
check("电阻从 0 起扫被拒", errs and errs[0]["code"] == "sweep_validation", str(errs))

p = divider()
p["sweep"] = {"element_id": "R2", "start": 10, "stop": -5, "points": 5}
errs = expect_problem(p)
check("电阻范围含负值被拒", errs and errs[0]["code"] == "sweep_validation", str(errs))

p = divider()
p["sweep"] = {"element_id": "R2", "start": 1, "stop": 10}
errs = expect_problem(p)
check("缺 points 被拒", errs and errs[0]["code"] == "sweep_validation", str(errs))

p = divider()
p["sweep"] = {"element_id": "R2", "start": 1, "stop": 10, "points": 11.0}
r = sweep(p)
check("points=11.0（整数值浮点）被接受", len(r["samples"]) == 11 and r["points"] == 11,
      str(r.get("points")))

p = divider()
p["sweep"] = {"element_id": "R2", "start": 1, "stop": 10, "points": float("nan")}
errs = expect_problem(p)
check("points 为 NaN 被拒", errs and errs[0]["code"] == "sweep_validation", str(errs))

p = divider()
errs = expect_problem(p)
check("缺 sweep 配置被拒", errs and errs[0]["code"] == "sweep_validation", str(errs))

# ---------- 7. 101 点上限可扫且首末点精确等于起止 ----------
p = divider()
p["sweep"] = {"element_id": "R2", "start": 1, "stop": 100, "points": 101}
r = sweep(p)
check("101 点扫描", len(r["samples"]) == 101, str(len(r["samples"])))
check("首点=起始值", r["samples"][0]["param"] == 1.0, str(r["samples"][0]["param"]))
check("末点=终止值", r["samples"][-1]["param"] == 100.0, str(r["samples"][-1]["param"]))

# ---------- 8. 扫描结果与单次 solve 一致（复用同一求解路径） ----------
p = divider(40.0)
once = solve(p)
p["sweep"] = {"element_id": "R2", "start": 40, "stop": 80, "points": 2}
r = sweep(p)
sv = {x["id"]: x["voltage"] for x in r["samples"][0]["node_voltages"]}
ov = {x["id"]: x["voltage"] for x in once["node_voltages"]}
check("首点与单次求解一致", all(math.isclose(sv[k], ov[k], abs_tol=1e-12) for k in sv),
      f"{sv} vs {ov}")

print()
if failures:
    print(f"{len(failures)} 个用例失败: {failures}")
    sys.exit(1)
print("全部用例通过 ✔")
