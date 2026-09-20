/* 直流网络校核器前端（原生 JS） */
"use strict";

const MAX_NODES = 30;
const MAX_ELEMENTS = 90;
const TYPE_LABEL = { R: "电阻", I: "电流源", V: "电压源" };
const TYPE_UNIT = { R: "Ω", I: "A", V: "V" };
const POWER_OK_REL = 1e-6; // 相对误差阈值（百万分之一）

let state = freshState();

function freshState() {
  return {
    ground: "0",
    nodes: [{ id: "0" }, { id: "1" }],
    elements: [
      { id: "V1", type: "V", node_p: "1", node_n: "0", value: "10" },
      { id: "R1", type: "R", node_p: "1", node_n: "0", value: "10" },
    ],
  };
}

const SAMPLES = {
  1: {
    ground: "0",
    nodes: [{ id: "0" }, { id: "1" }, { id: "2" }, { id: "3" }],
    elements: [
      { id: "V1", type: "V", node_p: "1", node_n: "0", value: "10" },
      { id: "R1", type: "R", node_p: "1", node_n: "2", value: "10" },
      { id: "R2", type: "R", node_p: "2", node_n: "0", value: "20" },
      { id: "R3", type: "R", node_p: "2", node_n: "3", value: "30" },
      { id: "I1", type: "I", node_p: "3", node_n: "0", value: "0.2" },
    ],
  },
  "2": {
    ground: "0",
    nodes: [{ id: "0" }, { id: "1" }, { id: "2" }, { id: "3" }],
    elements: [
      { id: "V1", type: "V", node_p: "1", node_n: "0", value: "10" },
      { id: "R1", type: "R", node_p: "1", node_n: "0", value: "10" },
      { id: "V2", type: "V", node_p: "2", node_n: "3", value: "5" },
      { id: "R2", type: "R", node_p: "2", node_n: "3", value: "100" },
    ],
  },
  "3": {
    ground: "0",
    nodes: [{ id: "0" }, { id: "1" }],
    elements: [
      { id: "V1", type: "V", node_p: "1", node_n: "0", value: "12" },
      { id: "V2", type: "V", node_p: "1", node_n: "0", value: "5" },
    ],
  },
};

/* ------------------------------ DOM 辅助 ------------------------------ */
const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  });
  children.forEach((c) => node.appendChild(c));
  return node;
};

/* ------------------------------ 表格渲染 ------------------------------ */
function nodeIds() {
  return state.nodes.map((n) => n.id);
}

function setSelectOptions(select, values, current) {
  // 重建某个 <select> 的选项并保留当前值；不会重建文本输入框，故不影响键入
  select.innerHTML = "";
  values.forEach((v) => select.appendChild(el("option", { value: v, text: v })));
  select.value = current && values.includes(current) ? current : "";
}

function renderGroundSelect() {
  if (!nodeIds().includes(state.ground)) state.ground = nodeIds()[0] || "";
  setSelectOptions($("#ground-select"), nodeIds(), state.ground);
}

function fillEndpointSelect(select, current) {
  // “—”空选项 + 缺失节点以红字样式的临时选项保留，避免值被静默改掉
  select.innerHTML = "";
  select.appendChild(el("option", { value: "", text: "—" }));
  state.nodes.forEach((n) =>
    select.appendChild(el("option", { value: n.id, text: n.id }))
  );
  if (current && !nodeIds().includes(current)) {
    const opt = el("option", { value: current, text: current + "（缺失）" });
    opt.style.color = "var(--err)";
    select.appendChild(opt);
  }
  select.value = current || "";
}

function renderNodes() {
  const tbody = $("#node-table tbody");
  tbody.innerHTML = "";
  state.nodes.forEach((n, i) => {
    const input = el("input", { value: n.id, placeholder: "如 n1" });
    input.addEventListener("input", () => {
      state.nodes[i].id = input.value.trim();
      renderGroundSelect();
      refreshEndpointSelects();
    });
    const del = el("button", { class: "icon-del", title: "删除", text: "✕" });
    del.addEventListener("click", () => {
      state.nodes.splice(i, 1);
      renderAll();
    });
    const tr = el("tr", { "data-id": n.id || `__row_${i}` }, [
      el("td", { text: String(i + 1) }),
      el("td", {}, [input]),
      el("td", {}, [del]),
    ]);
    tbody.appendChild(tr);
  });
  $("#node-count").textContent = `${state.nodes.length} / ${MAX_NODES}`;
  $("#btn-add-node").disabled = state.nodes.length >= MAX_NODES;
}

function renderElements() {
  const tbody = $("#element-table tbody");
  tbody.innerHTML = "";
  state.elements.forEach((e, i) => {
    // 编号
    const idInput = el("input", { value: e.id, placeholder: "如 R1" });
    idInput.addEventListener("input", () => (e.id = idInput.value.trim()));

    // 类型
    const typeSel = el("select");
    ["R", "I", "V"].forEach((t) =>
      typeSel.appendChild(el("option", { value: t, text: `${t} ${TYPE_LABEL[t]}` }))
    );
    typeSel.value = e.type;
    typeSel.addEventListener("change", () => (e.type = typeSel.value));

    // 端点
    const pSel = el("select");
    const nSel = el("select");
    fillEndpointSelect(pSel, e.node_p);
    fillEndpointSelect(nSel, e.node_n);
    pSel.addEventListener("change", () => (e.node_p = pSel.value));
    nSel.addEventListener("change", () => (e.node_n = nSel.value));

    // 参数值
    const valInput = el("input", { value: e.value, placeholder: "数值" });
    valInput.addEventListener("input", () => (e.value = valInput.value));

    const del = el("button", { class: "icon-del", title: "删除", text: "✕" });
    del.addEventListener("click", () => {
      state.elements.splice(i, 1);
      renderAll();
    });

    const tr = el("tr", { "data-id": e.id || `__erow_${i}`, "data-index": i }, [
      el("td", {}, [idInput]),
      el("td", {}, [typeSel]),
      el("td", {}, [pSel]),
      el("td", {}, [nSel]),
      el("td", {}, [valInput]),
      el("td", {}, [del]),
    ]);
    tbody.appendChild(tr);
  });
  $("#element-count").textContent = `${state.elements.length} / ${MAX_ELEMENTS}`;
  $("#btn-add-element").disabled = state.elements.length >= MAX_ELEMENTS;
}

function refreshEndpointSelects() {
  document.querySelectorAll("#element-table tbody tr").forEach((tr) => {
    const e = state.elements[Number(tr.getAttribute("data-index"))];
    if (!e) return;
    const selects = tr.querySelectorAll("select");
    fillEndpointSelect(selects[1], e.node_p);
    fillEndpointSelect(selects[2], e.node_n);
  });
}

function renderAll() {
  renderNodes();
  renderElements();
  renderGroundSelect();
  renderSweepElementSelect();
  clearFeedback();
}

/* ------------------------------ 新增行 ------------------------------ */
function nextNodeId() {
  const ids = new Set(nodeIds());
  let n = nodeIds().length;
  let candidate;
  do {
    n += 1;
    candidate = String(n);
  } while (ids.has(candidate));
  return candidate;
}

function nextElementId(type) {
  const ids = new Set(state.elements.map((e) => e.id));
  let n = 0;
  let candidate;
  do {
    n += 1;
    candidate = `${type}${n}`;
  } while (ids.has(candidate));
  return candidate;
}

$("#btn-add-node").addEventListener("click", () => {
  if (state.nodes.length >= MAX_NODES) return;
  state.nodes.push({ id: nextNodeId() });
  renderAll();
});

$("#btn-add-element").addEventListener("click", () => {
  if (state.elements.length >= MAX_ELEMENTS) return;
  const type = "R";
  state.elements.push({
    id: nextElementId(type),
    type,
    node_p: nodeIds()[0] || "",
    node_n: nodeIds()[1] || nodeIds()[0] || "",
    value: "1",
  });
  renderAll();
});

$("#ground-select").addEventListener("change", (ev) => {
  state.ground = ev.target.value;
});

document.querySelectorAll("[data-sample]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const s = SAMPLES[btn.getAttribute("data-sample")];
    state = {
      ground: s.ground,
      nodes: s.nodes.map((n) => ({ id: n.id })),
      elements: s.elements.map((e) => ({ ...e, value: String(e.value) })),
    };
    renderAll();
    clearSweepResult();
    $("#placeholder").classList.add("hidden");
  });
});

$("#btn-clear").addEventListener("click", () => {
  state = { ground: "", nodes: [], elements: [] };
  renderAll();
  clearSweepResult();
  $("#result-area").classList.add("hidden");
  $("#placeholder").classList.remove("hidden");
});

/* ------------------------------ 反馈区 ------------------------------ */
function clearFeedback() {
  $("#error-panel").classList.add("hidden");
  $("#error-panel").innerHTML = "";
  $("#warning-panel").classList.add("hidden");
  $("#warning-panel").innerHTML = "";
  document.querySelectorAll("tr.row-error").forEach((tr) => tr.classList.remove("row-error"));
  $("#ground-select").style.borderColor = "";
}

function showErrors(errors) {
  const panel = $("#error-panel");
  panel.innerHTML = "";
  const badRefs = new Set();
  const floatingNodes = new Set();

  errors.forEach((g) => {
    const group = el("div", { class: "err-group" });
    group.appendChild(el("div", { class: "err-title", text: `● ${g.message}` }));
    if (g.items && g.items.length) {
      const ul = el("ul");
      g.items.forEach((item) => {
        if (item.ref) {
          badRefs.add(item.ref);
          ul.appendChild(
            el("li", {}, [
              el("span", { class: "err-ref", text: item.ref + "：" }),
              document.createTextNode(item.detail),
            ])
          );
        } else if (item.nodes) {
          item.nodes.forEach((x) => floatingNodes.add(x));
          ul.appendChild(
            el("li", {}, [
              document.createTextNode("子网节点："),
              el("span", { class: "err-nodes", text: item.nodes.join("、") }),
            ])
          );
        } else {
          ul.appendChild(el("li", { text: item.detail || JSON.stringify(item) }));
        }
      });
      group.appendChild(ul);
    }
    if (["no_ground", "ground_not_found"].includes(g.code)) {
      $("#ground-select").style.borderColor = "var(--err)";
    }
    panel.appendChild(group);
  });

  // 高亮问题节点 / 元件所在行
  const mark = (tbodyId) => {
    document.querySelectorAll(`#${tbodyId} tbody tr`).forEach((tr) => {
      const id = tr.getAttribute("data-id");
      if (badRefs.has(id) || (tbodyId === "node-table" && floatingNodes.has(id))) {
        tr.classList.add("row-error");
      }
    });
  };
  mark("node-table");
  mark("element-table");

  $("#result-area").classList.add("hidden");
  $("#placeholder").classList.add("hidden");
  panel.classList.remove("hidden");
}

function showWarnings(warnings) {
  if (!warnings || !warnings.length) return;
  const panel = $("#warning-panel");
  const group = el("div", { class: "err-group" });
  group.appendChild(el("div", { class: "err-title", text: "⚠ 数值警告" }));
  const ul = el("ul");
  warnings.forEach((w) => ul.appendChild(el("li", { text: w })));
  group.appendChild(ul);
  panel.appendChild(group);
  panel.classList.remove("hidden");
}

/* ------------------------------ 客户端预校验 ------------------------------ */
function clientValidate() {
  const items = [];
  if (state.nodes.length === 0) {
    items.push({ ref: "-", detail: "至少需要一个节点（接地节点）" });
  }
  const idSet = new Set();
  state.nodes.forEach((n) => {
    if (!n.id) items.push({ ref: "-", detail: "存在编号为空的节点行" });
    else if (idSet.has(n.id)) items.push({ ref: n.id, detail: "节点编号重复" });
    idSet.add(n.id);
  });
  if (!state.ground || !idSet.has(state.ground)) {
    items.push({ ref: "-", detail: "未指定接地节点，或接地节点不在节点表中" });
  }

  const eSet = new Set();
  state.elements.forEach((e) => {
    if (!e.id) items.push({ ref: "-", detail: "存在编号为空的元件行" });
    else if (eSet.has(e.id)) items.push({ ref: e.id, detail: "元件编号重复" });
    eSet.add(e.id);
    const ref = e.id || "-";
    const v = Number(e.value);
    if (e.value === "" || !Number.isFinite(v)) {
      items.push({ ref, detail: `参数值“${e.value}”不是有限数字` });
    } else if (e.type === "R" && v <= 0) {
      items.push({ ref, detail: "电阻值必须大于 0" });
    }
    if (!e.node_p || !idSet.has(e.node_p))
      items.push({ ref, detail: `起始端 p 节点“${e.node_p || "空"}”不在节点表中` });
    if (!e.node_n || !idSet.has(e.node_n))
      items.push({ ref, detail: `终止端 n 节点“${e.node_n || "空"}”不在节点表中` });
    if (e.node_p && e.node_n && e.node_p === e.node_n)
      items.push({ ref, detail: "元件两端不能接在同一节点上" });
  });

  if (items.length) {
    showErrors([{ code: "validation", message: "输入校验未通过", items }]);
    return false;
  }
  return true;
}

/* ------------------------------ 数字格式 ------------------------------ */
function fmt(x) {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return "0";
  const ax = Math.abs(x);
  if (ax >= 1e6 || ax < 1e-4) return x.toExponential(4);
  return String(parseFloat(x.toPrecision(6)));
}

/* ------------------------------ 结果渲染 ------------------------------ */
function renderResults(r) {
  // 节点电压
  const vtb = $("#voltage-table tbody");
  vtb.innerHTML = "";
  r.node_voltages.forEach((row) => {
    const neg = row.voltage < 0;
    const grounded = row.id === r.ground;
    const tr = el("tr", { class: [grounded ? "row-ground" : "", neg ? "row-neg" : ""].join(" ").trim() });
    tr.appendChild(el("td", {}, [
      document.createTextNode(row.id),
      grounded ? el("span", { class: "badge", text: "⏚ 地", style: "margin-left:6px" }) : null,
    ].filter(Boolean)));
    const td = el("td");
    const span = el("span", { class: neg ? "num-neg" : "", text: fmt(row.voltage) });
    td.appendChild(span);
    tr.appendChild(td);
    vtb.appendChild(tr);
  });

  // 支路
  const btb = $("#branch-table tbody");
  btb.innerHTML = "";
  r.branches.forEach((b) => {
    const reversed = b.current < 0;
    const source = b.type !== "R";
    const tr = el("tr", { class: [source ? "row-source" : "", reversed ? "row-neg" : ""].join(" ").trim() });
    tr.appendChild(el("td", { text: b.id }));
    tr.appendChild(
      el("td", {}, [el("span", { class: `badge badge-${b.type.toLowerCase()}`, text: b.type })])
    );
    tr.appendChild(el("td", { text: `${b.node_p} → ${b.node_n}` }));
    tr.appendChild(el("td", { text: `${fmt(b.value)} ${TYPE_UNIT[b.type]}` }));
    const curTd = el("td");
    curTd.appendChild(el("span", { class: reversed ? "num-neg" : "", text: fmt(b.current) }));
    tr.appendChild(curTd);
    tr.appendChild(
      el("td", {
        text: b.current === 0 ? "—" : reversed ? `${b.node_n} → ${b.node_p}` : `${b.node_p} → ${b.node_n}`,
      })
    );
    const pTd = el("td");
    pTd.appendChild(el("span", { class: b.power < 0 ? "num-neg" : "", text: fmt(b.power) }));
    pTd.appendChild(
      document.createTextNode(b.power < 0 ? "（发出）" : b.power > 0 ? "（吸收）" : "")
    );
    tr.appendChild(pTd);
    btb.appendChild(tr);
  });

  // 功率平衡
  const pb = r.power_balance;
  const ok = pb.error_rel <= POWER_OK_REL;
  const card = $("#power-card");
  card.innerHTML = "";
  const stat = (k, v, cls = "") =>
    el("div", { class: "power-stat" }, [
      el("span", { class: "k", text: k }),
      el("span", { class: "v " + cls, text: v }),
    ]);
  card.appendChild(stat("总发出功率", fmt(pb.supplied) + " W"));
  card.appendChild(stat("总吸收功率", fmt(pb.absorbed) + " W"));
  card.appendChild(stat("绝对平衡误差", fmt(pb.error_abs) + " W", ok ? "" : "num-neg"));
  card.appendChild(stat("相对误差", fmt(pb.error_rel * 100) + " %", ok ? "" : "num-neg"));
  card.appendChild(
    el("div", { class: "power-balance-row " + (ok ? "ok" : "bad"),
      text: ok ? "✔ 功率平衡校核通过（KCL/KVL 自洽）" : "✖ 功率不平衡，结果不可信" })
  );

  $("#error-panel").classList.add("hidden");
  $("#placeholder").classList.add("hidden");
  $("#result-area").classList.remove("hidden");
}

/* ------------------------------ 提交求解 ------------------------------ */
function buildSolvePayload() {
  return {
    ground: state.ground,
    nodes: state.nodes.map((n) => n.id),
    elements: state.elements.map((e) => ({
      id: e.id,
      type: e.type,
      node_p: e.node_p,
      node_n: e.node_n,
      value: Number(e.value),
    })),
  };
}

$("#btn-solve").addEventListener("click", async () => {
  clearFeedback();
  if (!clientValidate()) return;

  const payload = buildSolvePayload();

  let resp;
  try {
    resp = await fetch("/api/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    showErrors([{ code: "network", message: `网络请求失败：${err}`, items: [] }]);
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    showErrors([{ code: "server", message: "服务端返回了无法解析的内容", items: [] }]);
    return;
  }

  if (resp.ok && data.ok) {
    renderResults(data);
    showWarnings(data.warnings);
  } else {
    showErrors(data.errors || [{ code: "server", message: "求解失败", items: [] }]);
  }
});

renderAll();

/* ====================================================================== */
/*                        单参数扫描（sweep）                              */
/* ====================================================================== */
const SWEEP_POINTS_MIN = 2;
const SWEEP_POINTS_MAX = 101;

let sweepData = null; // 最近一次扫描的完整响应；切换观测量时复用，不重复请求

/* ------------------------------ 元件选择 ------------------------------ */
function renderSweepElementSelect() {
  const sel = $("#sweep-element");
  const prev = sel.value;
  sel.innerHTML = "";
  if (!state.elements.length) {
    sel.appendChild(el("option", { value: "", text: "（元件表为空）" }));
    sel.value = "";
  } else {
    state.elements.forEach((e) =>
      sel.appendChild(
        el("option", { value: e.id, text: `${e.id}　${e.type} ${TYPE_LABEL[e.type]}（${TYPE_UNIT[e.type]}）` })
      )
    );
    sel.value = state.elements.some((e) => e.id === prev) ? prev : state.elements[0].id;
  }
  updateSweepHint();
}

function selectedSweepElement() {
  const id = $("#sweep-element").value;
  return state.elements.find((e) => e.id === id) || null;
}

function updateSweepHint() {
  const e = selectedSweepElement();
  const hint = $("#sweep-hint");
  if (!e) {
    hint.textContent = "请先在元件表中添加元件；扫描不会改写当前电路表。";
  } else if (e.type === "R") {
    hint.textContent = `扫描电阻 ${e.id}，范围内每个采样值都必须大于 0 Ω。`;
  } else if (e.type === "I") {
    hint.textContent = `扫描电流源 ${e.id} 的电流（A），正值电流由 p 流向 n；允许取负值。`;
  } else {
    hint.textContent = `扫描电压源 ${e.id} 的电动势（V），p 为正极；允许取负值。`;
  }
}

$("#sweep-element").addEventListener("change", updateSweepHint);

function showSweepError(errors) {
  const box = $("#sweep-error");
  box.innerHTML = "";
  (Array.isArray(errors) ? errors : [errors]).forEach((g) => {
    if (typeof g === "string") {
      box.appendChild(el("div", { text: g }));
      return;
    }
    box.appendChild(el("div", { text: `● ${g.message || "扫描配置有误"}` }));
    if (g.items && g.items.length) {
      const ul = el("ul");
      g.items.forEach((it) =>
        ul.appendChild(
          el("li", {}, [
            it.ref && it.ref !== "-" ? el("span", { class: "err-ref", text: it.ref + "：" }) : null,
            document.createTextNode(it.detail || ""),
          ].filter(Boolean))
        )
      );
      box.appendChild(ul);
    }
  });
  box.classList.remove("hidden");
}

function clearSweepError() {
  const box = $("#sweep-error");
  box.innerHTML = "";
  box.classList.add("hidden");
}

function clearSweepResult() {
  sweepData = null;
  $("#sweep-area").classList.add("hidden");
  clearSweepError();
}

/* ------------------------------ 扫描前校验 ------------------------------ */
function sweepClientValidate() {
  const e = selectedSweepElement();
  if (!e) return "请先在元件表中选择要扫描的元件";
  // 基础电路必须先合法；扫描只替换参数，结构问题会表现为逐点错误
  if (!clientValidate()) {
    return "当前电路表未通过单次校核校验，请先修正后再扫描";
  }

  const startStr = $("#sweep-start").value.trim();
  const stopStr = $("#sweep-stop").value.trim();
  const pointsStr = $("#sweep-points").value.trim();
  const start = Number(startStr);
  const stop = Number(stopStr);

  if (startStr === "" || !Number.isFinite(start))
    return `起始值“${startStr}”不是有限数字`;
  if (stopStr === "" || !Number.isFinite(stop))
    return `终止值“${stopStr}”不是有限数字`;
  if (start === stop) return "起始值与终止值相同，扫描范围为空（两者必须不同）";

  if (!/^[+-]?\d+$/.test(pointsStr))
    return `采样点数“${pointsStr}”必须是整数`;
  const points = Number(pointsStr);
  if (points < SWEEP_POINTS_MIN || points > SWEEP_POINTS_MAX)
    return `采样点数为 ${points}，超出允许范围 ${SWEEP_POINTS_MIN}～${SWEEP_POINTS_MAX}`;

  if (e.type === "R" && Math.min(start, stop) <= 0)
    return `电阻 ${e.id} 的扫描范围 [${start}, ${stop}] Ω 含非正值；电阻值必须全程大于 0`;

  return null;
}

/* ------------------------------ 发起扫描 ------------------------------ */
$("#btn-sweep").addEventListener("click", async () => {
  clearFeedback();
  clearSweepError();
  const errMsg = sweepClientValidate();
  if (errMsg) {
    showSweepError(errMsg);
    return;
  }

  const btn = $("#btn-sweep");
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = "扫描中…";

  const payload = buildSolvePayload();
  payload.sweep = {
    element_id: $("#sweep-element").value,
    start: Number($("#sweep-start").value),
    stop: Number($("#sweep-stop").value),
    points: Number($("#sweep-points").value),
  };

  let resp;
  try {
    resp = await fetch("/api/sweep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    showSweepError(`网络请求失败：${err}`);
    btn.disabled = false;
    btn.textContent = oldText;
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    showSweepError("服务端返回了无法解析的内容");
    btn.disabled = false;
    btn.textContent = oldText;
    return;
  }

  btn.disabled = false;
  btn.textContent = oldText;

  if (resp.ok && data.ok) {
    sweepData = data;
    renderSweepResult();
  } else {
    // 扫描配置非法（422）：错误分组直接展示，不产生结果
    sweepData = null;
    $("#sweep-area").classList.add("hidden");
    showSweepError(data.errors || [{ message: "扫描失败", items: [] }]);
  }
});

/* ------------------------------ 观测量取值 ------------------------------ */
function observableOptions(d) {
  // 枚举所有成功点的节点 / 支路并集，防止个别点缺字段
  const nodeIds = [];
  const branchIds = [];
  d.samples.forEach((s) => {
    if (!s.ok) return;
    (s.node_voltages || []).forEach((nv) => {
      if (!nodeIds.includes(nv.id)) nodeIds.push(nv.id);
    });
    (s.branches || []).forEach((b) => {
      if (!branchIds.includes(b.id)) branchIds.push(b.id);
    });
  });
  const opts = [];
  nodeIds.forEach((id) => opts.push({ key: `n:${id}`, kind: "node", id, label: `节点电压 V(${id})` }));
  branchIds.forEach((id) => opts.push({ key: `b:${id}`, kind: "branch", id, label: `支路电流 I(${id})` }));
  return opts;
}

function sampleValue(s, opt) {
  if (!s.ok) return null;
  if (opt.kind === "node") {
    const row = (s.node_voltages || []).find((nv) => nv.id === opt.id);
    return row ? row.voltage : null;
  }
  const row = (s.branches || []).find((b) => b.id === opt.id);
  return row ? row.current : null;
}

function defaultObservableKey(d) {
  const opts = observableOptions(d);
  if (!opts.length) return "";
  // 默认选第一个非接地节点电压；接地节点电压恒为 0，没有扫描意义
  const nonGround = opts.find((o) => o.kind === "node" && o.id !== state.ground);
  return (nonGround || opts[0]).key;
}

/* ------------------------------ 结果总渲染 ------------------------------ */
function renderSweepResult() {
  const d = sweepData;
  if (!d) return;

  // 重建观测量下拉；保留用户上一次选择（“切换不重复请求”）
  const sel = $("#sweep-observable");
  const prev = sel.value;
  sel.innerHTML = "";
  const opts = observableOptions(d);
  opts.forEach((o) => sel.appendChild(el("option", { value: o.key, text: o.label })));
  sel.value = opts.some((o) => o.key === prev)
    ? prev
    : defaultObservableKey(d);

  const unit = TYPE_UNIT[d.element_type] || "";
  $("#sweep-th-param").textContent = `${d.element_id} 参数值 (${unit})`;

  const { total, succeeded, failed } = d.summary;
  const sum = $("#sweep-summary");
  sum.innerHTML = "";
  sum.appendChild(document.createTextNode("扫描元件 "));
  sum.appendChild(el("b", { text: d.element_id }));
  sum.appendChild(document.createTextNode(`：${fmt(d.start)} → ${fmt(d.stop)} ${unit}，共 ${total} 个采样点，成功 `));
  sum.appendChild(el("b", { class: "ok", text: String(succeeded) }));
  sum.appendChild(document.createTextNode(" 个，失败 "));
  sum.appendChild(el("b", { class: failed ? "bad" : "ok", text: String(failed) }));
  sum.appendChild(document.createTextNode(" 个（失败点保留错误且不影响其它点）"));

  renderSweepChart();
  renderSweepTable();
  $("#sweep-area").classList.remove("hidden");
}

$("#sweep-observable").addEventListener("change", () => {
  if (!sweepData) return;
  renderSweepChart();
  renderSweepTable();
});

/* ------------------------------ 明细表 ------------------------------ */
function currentObservable() {
  const key = $("#sweep-observable").value;
  return observableOptions(sweepData).find((o) => o.key === key) || null;
}

function firstErrorMessage(s) {
  if (s.ok || !s.errors || !s.errors.length) return "";
  const g = s.errors[0];
  const parts = [g.message];
  (g.items || []).forEach((it) => {
    if (it.detail) parts.push(`${it.ref && it.ref !== "-" ? it.ref + "：" : ""}${it.detail}`);
  });
  return parts.join("；");
}

function renderSweepTable() {
  const d = sweepData;
  const opt = currentObservable();
  const unit = opt ? (opt.kind === "node" ? "V" : "A") : "";
  $("#sweep-th-value").textContent = opt ? `${opt.label.split(" ")[0]} (${unit})` : "观测值";

  const tbody = $("#sweep-table tbody");
  tbody.innerHTML = "";
  d.samples.forEach((s) => {
    const tr = el("tr", { class: s.ok ? "" : "row-fail" });
    tr.appendChild(el("td", { text: String(s.index + 1) }));
    tr.appendChild(el("td", { text: fmt(s.param) }));
    const statusTd = el("td");
    statusTd.appendChild(
      s.ok
        ? el("span", { class: "sweep-badge sweep-badge-ok", text: "成功" })
        : el("span", { class: "sweep-badge sweep-badge-fail", text: "失败" })
    );
    tr.appendChild(statusTd);
    const val = s.ok && opt ? sampleValue(s, opt) : null;
    tr.appendChild(el("td", { text: s.ok && Number.isFinite(val) ? fmt(val) : "—" }));
    tr.appendChild(el("td", { class: "fail-detail", text: s.ok ? "" : firstErrorMessage(s) }));
    tbody.appendChild(tr);
  });
}

/* ------------------------------ SVG 折线图 ------------------------------ */
const SVG_NS = "http://www.w3.org/2000/svg";

function niceTicks(lo, hi, n = 5) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return [lo || 0];
  const raw = (hi - lo) / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const start = Math.ceil(lo / step) * step;
  const ticks = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) ticks.push(v);
  return ticks;
}

function svgEl(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  children.forEach((c) => node.appendChild(c));
  return node;
}

function svgText(x, y, content, attrs = {}) {
  const t = svgEl("text", { x, y, ...attrs });
  t.textContent = content;
  return t;
}

function renderSweepChart() {
  const d = sweepData;
  const opt = currentObservable();
  const box = $("#sweep-chart");
  box.innerHTML = "";

  const W = 760;
  const H = 340;
  const M = { top: 24, right: 24, bottom: 52, left: 64 };
  const pw = W - M.left - M.right;
  const ph = H - M.top - M.bottom;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });

  const params = d.samples.map((s) => s.param);
  const xLo0 = Math.min(...params);
  const xHi0 = Math.max(...params);
  const xPad = xHi0 > xLo0 ? (xHi0 - xLo0) * 0.04 : Math.max(1, Math.abs(xLo0) * 0.1);
  const xLo = xLo0 - xPad;
  const xHi = xHi0 + xPad;

  const points = []; // {x, y}
  d.samples.forEach((s) => {
    if (!s.ok || !opt) return;
    const val = sampleValue(s, opt);
    if (Number.isFinite(val)) points.push({ x: s.param, y: val });
  });

  let yLo = 0;
  let yHi = 1;
  if (points.length) {
    const ys = points.map((p) => p.y);
    yLo = Math.min(...ys);
    yHi = Math.max(...ys);
    const yPad = yHi > yLo ? (yHi - yLo) * 0.08 : Math.max(0.2, Math.abs(yHi) * 0.1);
    yLo -= yPad;
    yHi += yPad;
  }

  const X = (v) => M.left + ((v - xLo) / (xHi - xLo)) * pw;
  const Y = (v) => M.top + ph - ((v - yLo) / (yHi - yLo)) * ph;

  // 网格 + Y 轴刻度
  niceTicks(yLo, yHi, 5).forEach((tv) => {
    if (tv < yLo - 1e-9 || tv > yHi + 1e-9) return;
    const y = Y(tv);
    svg.appendChild(svgEl("line", { class: "grid-line", x1: M.left, x2: M.left + pw, y1: y, y2: y }));
    svg.appendChild(svgText(M.left - 8, y + 4, fmt(tv), { "text-anchor": "end" }));
  });

  // X 轴刻度（取采样值，最多约 11 个）
  const stride = Math.max(1, Math.ceil(d.samples.length / 11));
  d.samples.forEach((s) => {
    if (s.index % stride !== 0 && s.index !== d.samples.length - 1) return;
    const x = X(s.param);
    svg.appendChild(svgText(x, M.top + ph + 18, fmt(s.param), { "text-anchor": "middle" }));
  });

  // 零线
  if (yLo < 0 && yHi > 0) {
    const y0 = Y(0);
    svg.appendChild(svgEl("line", { class: "zero-line", x1: M.left, x2: M.left + pw, y1: y0, y2: y0 }));
  }

  // 坐标轴
  svg.appendChild(svgEl("line", {
    class: "axis", x1: M.left, x2: M.left + pw, y1: M.top + ph, y2: M.top + ph,
  }));
  svg.appendChild(svgEl("line", {
    class: "axis", x1: M.left, x2: M.left, y1: M.top, y2: M.top + ph,
  }));

  const paramUnit = TYPE_UNIT[d.element_type] || "";
  const obsUnit = opt ? (opt.kind === "node" ? "V" : "A") : "";
  svg.appendChild(svgText(
    M.left + pw / 2, H - 10,
    `${d.element_id} 参数 (${paramUnit})`,
    { class: "axis-title", "text-anchor": "middle" }
  ));
  svg.appendChild(svgText(
    16, M.top + ph / 2, opt ? `${opt.label} (${obsUnit})` : "观测值",
    { class: "axis-title", "text-anchor": "middle", transform: `rotate(-90 16 ${M.top + ph / 2})` }
  ));

  if (!points.length) {
    svg.appendChild(svgText(
      M.left + pw / 2, M.top + ph / 2,
      "所有采样点均求解失败，无法绘制曲线（详见下表）",
      { class: "empty-note", "text-anchor": "middle" }
    ));
  } else {
    // 折线：失败点把折线断开，避免错误连线
    let seg = [];
    const flush = () => {
      if (seg.length >= 2) {
        svg.appendChild(
          svgEl("polyline", { class: "curve", points: seg.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ") })
        );
      }
      seg = [];
    };
    d.samples.forEach((s) => {
      if (!s.ok || !opt) {
        flush();
        return;
      }
      const val = sampleValue(s, opt);
      if (!Number.isFinite(val)) {
        flush();
        return;
      }
      seg.push({ x: s.param, y: val });
    });
    flush();

    // 成功点圆点
    points.forEach((p) => {
      const title = svgEl("title");
      title.textContent = `${fmt(p.x)} ${paramUnit} → ${fmt(p.y)} ${obsUnit}`;
      svg.appendChild(
        svgEl("circle", { class: "pt", cx: X(p.x), cy: Y(p.y), r: 3.4 }, [title])
      );
    });
  }

  // 失败点：在 X 轴上画红叉
  const baseY = M.top + ph;
  d.samples.forEach((s) => {
    if (s.ok) return;
    const cx = X(s.param);
    const g = svgEl("g", {}, [
      svgEl("line", { x1: cx - 5, y1: baseY - 5, x2: cx + 5, y2: baseY + 5 }),
      svgEl("line", { x1: cx - 5, y1: baseY + 5, x2: cx + 5, y2: baseY - 5 }),
    ]);
    g.setAttribute("class", "pt-fail");
    const title = svgEl("title");
    title.textContent = `${fmt(s.param)} ${paramUnit} 失败：${firstErrorMessage(s)}`;
    g.appendChild(title);
    svg.appendChild(g);
  });

  box.appendChild(svg);
}
