# 直流网络校核器

一个用于直流电阻网络建模与校核的 Web 应用。前端为原生 HTML/CSS/JS，后端使用
**Python FastAPI + NumPy**，通过**改进节点分析（Modified Nodal Analysis, MNA）**
组装并求解线性方程。

## 功能

- 最多录入 **30 个节点**，以及电阻（R）、独立电流源（I）、独立电压源（V）三类元件，
  可指定任意节点为接地（电位 0 V）。
- 服务端组装 MNA 增广矩阵并求解，返回：
  - 各**节点电压**（含接地节点）；
  - 各**支路方向电流**（支路正方向取 `p → n`，负值时前端反色并标出实际方向）；
  - 全网**功率平衡**信息：总发出 / 总吸收功率、绝对与相对误差，达标时高亮“校核通过”。
- 对无法得到唯一解的网络**不崩溃**，而是区分并列出相关节点 / 元件：
  - **无接地**或接地节点不在节点表中；
  - **浮置子网**：与接地之间仅通过电流源连接（或完全悬空）的连通片，列出其中节点；
  - **理想电压源互相矛盾**：如不同电压的理想电压源并联，列出冲突元件。
- **单参数扫描**：从元件表选择一个元件，在给定范围内逐点替换其参数并复用同一套
  MNA 求解与结构诊断，结果以折线图展示任一节点电压或支路电流随参数的变化。
- 前端提供三个示例一键载入（正常网络 / 浮置子网 / 电压源冲突）、表格化编辑、
  提交前输入校验、结果与问题行高亮。

## 单参数扫描

在左侧“单参数扫描”卡片中：

1. **扫描元件**：从当前元件表中选择一个 R / I / V 元件；
2. 设置**起始值、终止值**（允许起值大于止值，即反向扫描）和**采样点数（2～101）**；
3. 点击“开始扫描”。后端在 `[起始值, 终止值]` 上做等间距线性采样，逐点临时替换该
   元件的参数后求解，**不会改写当前电路表**；
4. 结果区用**折线图**展示观测量随参数的变化，图下明细表逐点列出序号、参数值、
   成功 / 失败状态、观测值与失败原因；
5. 通过右上角“**观测量**”下拉可在各节点电压与支路电流之间切换，曲线与表格直接
   依据已返回的数据重绘，**不重新发起请求**。

扫描特性与校验：

- **单点失败不中断**：某个采样点出现结构问题（如理想电压源冲突、浮置子网、矩阵奇异）
  时，其结构化错误原样记录在该采样点上（图中以红叉标出），其余点照常求解；
- 即使所有采样点都失败，扫描请求本身仍返回 `200`，逐点错误见响应中的
  `samples[*].errors`；
- 下列问题属于**扫描配置非法**，直接返回 `422`，不产生任何采样点：
  - 起始值 / 终止值缺失、不是有限数字，或两者相同（范围为空）；
  - 采样点数不是整数或超出 **2～101**；
  - 扫描电阻时范围内含 **≤ 0** 的值（电阻必须全程为正）；
  - 指定元件不在元件表中。

## 元件方向约定

| 类型 | 参数含义 | 方向 / 极性 |
| ---- | -------- | ----------- |
| `R` 电阻 | 电阻值（Ω，> 0） | 支路正方向 `p → n` |
| `I` 电流源 | 电流（A） | 正值表示电流由 `p` 流向 `n` |
| `V` 电压源 | 电动势（V） | `p` 为正极、`n` 为负极，支路电流正方向 `p → n` |

支路功率按**关联参考方向**计算：`P = (V_p − V_n)·I`。`P > 0` 为吸收功率，
`P < 0` 为发出功率；全网吸收功率之和应接近 0。

## 快速启动

需要已安装 Docker（含 Compose 插件）。在项目根目录执行：

```bash
docker compose up --build
```

启动后用浏览器访问：

- **http://localhost:8000**

API：

- `GET  /api/meta`：容量与元件类型元信息（含 `sweep_points_min / sweep_points_max`）；
- `POST /api/solve`：请求体为网络 JSON（见下），成功返回 `200`，
  输入或结构问题返回 `422`，错误按 `no_ground / floating_subnet / voltage_conflict / validation`
  分组列出；
- `POST /api/sweep`：请求体与 `/api/solve` 相同，另加一个 `sweep` 配置对象（见下）。
  扫描配置非法返回 `422`（错误码 `sweep_validation`）；扫描正常完成返回 `200`，
  各采样点的成功 / 失败状态与错误分别放在 `samples[*]` 中。

停止服务：

```bash
docker compose down
```

## 配置

- 容器内固定监听 **8000** 端口，compose 将宿主机同号端口映射进去。
  若宿主机 8000 被占用，可修改 `compose.yaml`：

  ```yaml
  ports:
    - "8080:8000"   # 宿主机端口:容器端口
  ```

- 无其它外部依赖：不使用数据库，数据只存在浏览器页面中，刷新即重置。

## 请求示例

单次求解：

```bash
curl -s -X POST http://localhost:8000/api/solve \
  -H 'Content-Type: application/json' \
  -d '{
    "ground": "0",
    "nodes": ["0", "1"],
    "elements": [
      {"id": "V1", "type": "V", "node_p": "1", "node_n": "0", "value": 10},
      {"id": "R1", "type": "R", "node_p": "1", "node_n": "0", "value": 10}
    ]
  }'
```

单参数扫描（将 R1 从 1 Ω 扫到 100 Ω，共 11 个采样点）：

```bash
curl -s -X POST http://localhost:8000/api/sweep \
  -H 'Content-Type: application/json' \
  -d '{
    "ground": "0",
    "nodes": ["0", "1"],
    "elements": [
      {"id": "V1", "type": "V", "node_p": "1", "node_n": "0", "value": 10},
      {"id": "R1", "type": "R", "node_p": "1", "node_n": "0", "value": 10}
    ],
    "sweep": {"element_id": "R1", "start": 1, "stop": 100, "points": 11}
  }'
```

响应结构（节选）：

```json
{
  "ok": true,
  "element_id": "R1",
  "element_type": "R",
  "start": 1.0,
  "stop": 100.0,
  "points": 11,
  "summary": {"total": 11, "succeeded": 11, "failed": 0},
  "samples": [
    {
      "index": 0,
      "param": 1.0,
      "ok": true,
      "node_voltages": [{"id": "0", "voltage": 0.0}, {"id": "1", "voltage": 10.0}],
      "branches": [{"id": "V1", "current": -10.0}, {"id": "R1", "current": 10.0}]
    },
    {"index": 1, "param": 10.9, "ok": false,
     "errors": [{"code": "...", "message": "...", "items": []}]}
  ]
}
```

## 本地开发（不使用 Docker）

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

开发用冒烟测试（不打进镜像）：

```bash
python3 test_solver.py   # MNA 数值正确性与结构诊断
python3 test_sweep.py    # 单参数扫描、逐点容错与配置校验
```

## 目录结构

```
.
├── app/
│   ├── main.py            # FastAPI 路由（/api/solve、/api/sweep）与静态文件
│   ├── solver.py          # MNA 组装、结构诊断、求解与单参数扫描
│   └── static/
│       ├── index.html     # 页面结构（含扫描配置与结果区）
│       ├── style.css      # 样式与高亮
│       └── app.js         # 表格编辑、校验、结果与扫描曲线渲染
├── test_solver.py         # 求解器冒烟测试
├── test_sweep.py          # 扫描冒烟测试
├── Dockerfile
├── compose.yaml
└── requirements.txt
```
