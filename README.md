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
- 前端提供三个示例一键载入（正常网络 / 浮置子网 / 电压源冲突）、表格化编辑、
  提交前输入校验、结果与问题行高亮。

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

- `GET  /api/meta`：容量与元件类型元信息；
- `POST /api/solve`：请求体为网络 JSON（见下），成功返回 `200`，
  输入或结构问题返回 `422`，错误按 `no_ground / floating_subnet / voltage_conflict / validation`
  分组列出。

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

## 本地开发（不使用 Docker）

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## 目录结构

```
.
├── app/
│   ├── main.py            # FastAPI 路由与静态文件
│   ├── solver.py          # MNA 组装、结构诊断与求解
│   └── static/
│       ├── index.html     # 页面结构
│       ├── style.css      # 样式与高亮
│       └── app.js         # 表格编辑、校验、结果渲染
├── Dockerfile
├── compose.yaml
└── requirements.txt
```
