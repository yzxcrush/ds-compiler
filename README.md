# Ds Compiler（Android）

手机上的 **Ds v0.1 编译器**（v0.3.0）：**Pydroid 3 风格全屏编辑器** + 行号 + 符号快捷栏 + 输出控制台。
单 Activity + WebView 外壳，Ds 词法/解析/求值全部内置在 `assets/ds.js`，**完全离线**，不需要网络权限。

## 功能

| 模块 | 说明 |
|---|---|
| 编辑器 | Pydroid 3 风格：全屏黑底编辑器、行号、文件名、自动保存草稿、Tab 缩进、Ctrl+Enter 运行 |
| 符号快捷栏 | 键盘上方 `; ' # ( ) [ ] { } " = + - * / : , . < > _` 一键插入，左右滑动 |
| 运行 | 右下黄色圆形 ▶；输出/错误进入底部控制台（可折叠），带行列号 |
| 文件 | 多脚本本地保存（localStorage），新建/打开/保存/删除 |
| 示例 | Flow hello/fib、0.1c concise、hello、fib、primes、collections 七个示例 |
| 设置 | 字号 A− / A＋、清空输出，抽屉式菜单 |
| AI 训练 | 内置「AI 训练教程」：上下文包 / SFT 数据 / 评测命令，链接一键复制或跳转 GitHub |
| GitHub / 包 | 抽屉提供仓库、Ds+ 分支、dspm 包管理、规范、llms.txt、数据集、落地页外链 |
| 署名 | 界面右下角与关于处显示水印 **@惜白.** |

## Ds 支持范围（编译器核心子集 + 新写法）

支持三档写法，语义一致、可混用：

- **经典写法**：`package` / `fn main` / `{...}`
- **0.1c 精简写法**：隐式入口、`fn add(a,b)=a+b`、`:` 单语句体、`..` 范围、f-string、`p/s/l/r` 别名
- **Flow 写法**：`#!flow` 开头，`\\` 定义函数、并置调用（`p "hi"`）、`.` 结束块、`?` 条件、`^` 返回、`;` 代 else

### 基础能力

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
│   ├── index.html      # Pydroid 风格界面结构
│   ├── style.css       # 暗色编辑器主题
│   ├── ui.js           # 编辑器/文件/示例/控制台逻辑
│   └── ds.js           # Ds 编译器内核（词法/解析/求值）
└── res/                # 图标与字符串
tests/node_test.js      # 内核单元测试（Node 直接跑）
```

## 测试

```bash
node tests/node_test.js    # 60 项内核测试
```

## License

MIT
