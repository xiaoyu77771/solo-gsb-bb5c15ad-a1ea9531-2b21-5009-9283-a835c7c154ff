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
    $("#placeholder").classList.add("hidden");
  });
});

$("#btn-clear").addEventListener("click", () => {
  state = { ground: "", nodes: [], elements: [] };
  renderAll();
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
$("#btn-solve").addEventListener("click", async () => {
  clearFeedback();
  if (!clientValidate()) return;

  const payload = {
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
