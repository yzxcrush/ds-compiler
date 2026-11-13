# Ds Compiler（Android）

手机上的 **Ds v0.1 编译器**：Telegram 风格聊天界面 + Pydroid 3 式编辑器/运行/控制台。
单 Activity + WebView 外壳，Ds 词法/解析/求值全部内置在 `assets/ds.js`，**完全离线**，不需要网络权限。

## 功能

| 模块 | 说明 |
|---|---|
| 聊天式控制台 | Telegram 风格暗色主题：代码气泡（右侧蓝色）、编译器输出气泡（左侧灰色）、错误气泡（红色），✓✓ 运行成功标记、时间戳、输出一键复制 |
| 编辑器 | 全屏编辑器、行号、Tab 缩进、Ctrl+Enter 运行、自动保存到本地脚本 |
| 运行 | 点 ▶ 编译并执行，输出/错误直接回帖；错误带行列号 |
| 文件 | 多脚本本地保存（localStorage），新建/打开/删除 |
| 示例 | hello、斐波那契、质数、集合 四个内置示例 |
| 设置 | 字号 A− / A＋，左右滑动抽屉 |

## Ds 支持范围（编译器核心子集）

支持：`package`、`fn`（参数/返回类型/默认参数/递归/闭包）、`let`/`var`、`if`/`else`、`while`、`loop`、`for-in`、`break`/`continue`/`return`、
字面量（十进制/十六进制/二进制整数、浮点、字符串、字节串、数组、映射）、整数/浮点/字符串/数组运算、比较与逻辑、位运算、
`|>` 管道、函数值、`len`/`range`/`str`/`concat`/`format`/`math.sqrt|round|floor|ceil|abs|pow`、错误定位、死循环步数保护。

暂不支持（会给出明确报错）：`class/trait/impl`、`match`、`opt/res`、`try/catch`、宏与 `comptime`、并发与内存原语——这些属于完整规范，后续版本补齐。

## 下载安装（最新构建）

- Release 页面：<https://github.com/yzxcrush/ds-compiler/releases/latest>
- 直接下载：<https://github.com/yzxcrush/ds-compiler/releases/latest/download/app-debug.apk>

手机上下载后点击安装即可（debug 签名，需允许「安装未知来源应用」）。完全离线，无网络权限。

## 构建 APK（GitHub Actions）

推送到 `main` 或手动 `workflow_dispatch` 即自动构建：

1. Actions 运行 `build-apk`；
2. 构建完成后在 **Artifacts** 下载 `ds-compiler-apk`（`app-debug.apk`）；
3. 手机安装（需允许「安装未知来源应用」）。

工作流：`.github/workflows/android.yml`（JDK 17 + Gradle 8.7 + Android SDK 34）。

本地构建（需 Android SDK）：

```bash
gradle :app:assembleDebug
# 产物：app/build/outputs/apk/debug/app-debug.apk
```

## 结构

```
app/src/main/
├── AndroidManifest.xml
├── java/dev/ds/compiler/MainActivity.java   # WebView 外壳
├── assets/
│   ├── index.html      # 界面结构（Telegram 风格）
│   ├── style.css       # 暗色主题
│   ├── ui.js           # 聊天/编辑器/文件/示例逻辑
│   └── ds.js           # Ds 编译器内核（词法/解析/求值）
└── res/                # 图标与字符串
tests/node_test.js      # 内核单元测试（Node 直接跑）
```

## 测试

```bash
node tests/node_test.js    # 21 项内核测试
```

## License

MIT
