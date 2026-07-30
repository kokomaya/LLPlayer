# Contributing / 开发与调试指南 — Aurora Player

本文件说明**调试环境如何搭建**，以及**三种调试场景各自怎么用**。命令与技术名词保留英文，说明用中文。

---

## 0. 先理解一件事：这个仓库有「两种代码」

调试方式完全取决于你改的是哪一种：

| 类型 | 位置 | 特点 | 怎么调 |
|---|---|---|---|
| **纯逻辑核心（headless）** | `packages/**`、`apps/mobile/src/**/*.ts`（**非** `.tsx`） | 纯 TypeScript，不碰设备/网络，Node 下可跑 | **Vitest（场景 A）** — 最快，不用真机 |
| **设备 UI / 平台绑定** | `apps/mobile/App.tsx`、`apps/mobile/src/ui/*.tsx` | 依赖 React Native / Expo / ExoPlayer，只能在真机/模拟器跑 | **RN DevTools + logcat（场景 B）**；原生问题用 **Android Studio（场景 C）** |

设计原则是「**薄绑定 + 厚可测**」：能在 Node 测的逻辑都抽进 `.ts` 核心，`.tsx` 只留最薄一层。
**所以 90% 的调试应该发生在场景 A（Node），不需要真机。** 只有真机相关的问题才进 B / C。

---

## 1. 环境搭建（一次性）

### 必备
- **Node** 20+ 与 **pnpm**（仓库用 pnpm workspaces + Nx）
- **JDK 17**（Android 构建需要）
- **Android SDK** + **Android Studio**（含至少一个模拟器 AVD，或一台开启 USB 调试的真机）
- 确认 `adb` 在 PATH 上：`adb devices` 能看到设备
- 确认 `ANDROID_HOME` 已设置（本机为 `C:\Users\<you>\AppData\Local\Android\Sdk`）

### 安装依赖
```bash
cd aurora-player
pnpm install
```
> ⚠️ **pnpm hoist 坑**：本机 pnpm store 在 `D:\ps`，个别情况下 `pnpm install` 会把根依赖
> 从 store 里「un-hoist」掉，导致 nx 的 lint/boundaries 崩。装完后自检一句：
> `node -e "require.resolve('typescript')"`，报错就说明中招了，需修 junction。

### VSCode（推荐主力工具）
- **打开 `LLPlayer` 根目录**（不是 `aurora-player`）——`.vscode/launch.json` 里的相对路径以
  `LLPlayer` 为 `${workspaceFolder}`，打错目录会导致所有配置路径失效。
- 装扩展 **React Native Tools**（`msjsdiag.vscode-react-native`）——场景 B 的 attach 需要它。

---

## 2. 场景 A：调试纯逻辑核心（Vitest，Node，**首选**）

改 `demo-media.ts`、presenter、controls、`player-runtime.ts` 等纯逻辑时用这个。**不需要真机。**

### 2.0 什么是「断点」（先看这段）

断点 = 让程序**执行到某一行时暂停**，这样你可以查看那一刻所有变量的值、一步步往下走，看清
逻辑到底怎么跑的——比到处 `console.log` 高效得多。

**调试时这几个键最常用（记住即可）：**

| 键 | 作用 |
|---|---|
| **F9** | 在光标所在行**加/去掉断点**（也可直接点行号左边那条空白栏，会出现红点） |
| **F5** | 开始调试 / 继续运行到下一个断点 |
| **F10** | 单步（Step Over）——执行当前行，不进入函数内部 |
| **F11** | 步入（Step Into）——进入当前行调用的函数里面 |
| **Shift+F11** | 步出（Step Out）——从当前函数跳回它的调用处 |
| **Shift+F5** | 停止调试 |

暂停时：左侧 **VARIABLES** 看变量值，**CALL STACK** 看调用链，鼠标**悬停**在代码里的变量上也会
显示当前值；底部 **DEBUG CONSOLE** 里可以直接输入表达式求值（比如敲 `names` 回车看它的内容）。

### 2.1 手把手：打你的第一个断点（约 3 分钟）

以 `demo-media.ts` 的挑字幕逻辑为例：

1. 用 VSCode 打开 **`LLPlayer` 根目录**（不是 `aurora-player`）。
2. 打开 `aurora-player/apps/mobile/src/composition/demo-media.test.ts`。
3. 在某个 `expect(...)` 那一行的**行号左边空白处点一下**，出现一个**红点** = 断点已设
   （或把光标放到那行按 **F9**）。
4. 打开左侧 **Run and Debug** 面板（图标像个带虫子的三角，或按 `Ctrl+Shift+D`）。
5. 顶部下拉选 **"Aurora Mobile: Debug tests (Vitest)"**，按 **F5**。
6. 程序跑到红点处**停下**，那一行会高亮。此时：
   - 左侧看变量；把鼠标悬停到 `pickBestSubtitle(...)` 的参数上看它的值。
   - 按 **F11** 步入 `pickBestSubtitle`，看它内部怎么挑；按 **Shift+F11** 跳回来。
   - 按 **F5** 继续到下一个断点，或 **Shift+F5** 结束。

> 只想跑某一个测试文件：把该配置 `command` 里的 `pnpm exec vitest run` 后加个关键字，
> 例如 `pnpm exec vitest run demo-media`，这样启动更快、断点更聚焦。

### 2.2 用命令行（不带断点，快速验证）

```bash
cd aurora-player
pnpm exec nx test mobile          # 只跑 mobile 的 78 个测试
pnpm exec nx run-many -t typecheck lint test   # 全部质量门禁
pnpm test:boundaries              # 架构边界（DIP）反例
```

> 想理解一段逻辑，最快的办法是**给它写个小测试**、在里面打断点，然后场景 A 里 F5 跑，而不是上真机。

---

## 3. 场景 B：调试设备上的 JS（React Native DevTools + logcat）

改 `App.tsx` / `src/ui/*.tsx`，或排查「界面上不对」的问题时用这个。

> ⚠️ 场景 B 的前提：**必须先有一台设备在运行**（模拟器或真机）。场景 A（Node/Vitest）不需要，
> 场景 B/C 都需要。

### 3.0 先启动模拟器（或连真机）

**方式一 · Android Studio（最直观）：** 右下角 / 菜单 **Device Manager** → 选一个 AVD 点 ▶ 启动。
没有 AVD 就点 **Create Device** 建一个（选个 Pixel + 较新的系统镜像即可）。

**方式二 · 命令行启动模拟器：**
```bash
# 列出已有的 AVD 名字
"$ANDROID_HOME/emulator/emulator" -list-avds
# 用其中一个名字启动（例如 Medium_Phone_API_36.0）
"$ANDROID_HOME/emulator/emulator" -avd <AVD名字>
```

**方式三 · 真机：** 手机开启「开发者选项 → USB 调试」，USB 连上电脑，弹窗点「允许」。

**确认设备就绪**（三种方式最后都要能看到设备）：
```bash
adb devices        # 应列出 emulator-5554 或你的真机序列号，状态为 device
```

> 首次装 app：设备就绪后跑一次 `cd apps/mobile && pnpm exec expo run:android`，它会**构建原生并
> 自动安装**到当前运行的模拟器/真机（若没有模拟器在跑，它也会尝试帮你起一个）。之后日常改
> `.tsx` 只需 §3.1 的 Metro + 热更新，不用每次重装。

### 3.1 启动 Metro（app 已装好后的日常）
- VSCode Run and Debug → **"Aurora Mobile: Start Expo Dev Server"**（= `expo start --dev-client --clear`）。
- 或命令行：`cd apps/mobile && pnpm exec expo start --dev-client --clear`。
- 然后在设备上打开 app（dev build，包名 `com.anonymous.auroramobile`）。改 `.tsx` 存盘 →
  Metro 会 **Fast Refresh** 自动热更新（无需重装）。

### 3.2 打断点 / 看 console —— React Native DevTools
在 Metro 运行的终端里按 **`j`**，打开 React Native DevTools（基于 Chrome DevTools）。这是
RN 0.76+（本项目 RN 0.86 + 新架构）**官方支持**的 JS 调试器。手把手：

1. 确保 app 已在设备上运行、且连着 Metro。
2. Metro 终端里按 **`j`**（浏览器会打开 DevTools 窗口）。
3. 切到 **Sources** 面板 → 左侧文件树找到你的源码（如 `App.tsx`）。
4. 在想暂停的那一行**点行号**，出现蓝色标记 = 断点。
5. 在设备上触发那段代码（比如重开 app / 点某个按钮），执行就会停在断点，
   右侧看 **Scope** 变量、**Call Stack**，顶部按钮或快捷键单步/继续。
6. **Console** 面板能看到所有 `console.log`（例如本项目的 `[Aurora] device probe: ...`）。

> `.vscode` 里的 "Attach to Metro" 是老式 attach，在本 RN 版本上可能连不上；连不上就用 `j`。

### 3.3 看日志 —— `adb logcat`
```bash
adb logcat -s ReactNativeJS:V                       # 只看 JS 的 console.*
adb logcat | grep -iE "ExoPlayback|ERROR_CODE|Aurora|FileSystem"   # 播放/文件相关
```
> 本项目 `App.tsx` 启动时会打印一行 `[Aurora] device probe: ...`，直接告诉你设备装载走到哪一步、
> 失败在哪。屏幕上的黄色小字也是同一诊断信息。

### 3.4 打开设备内置开发菜单
```bash
adb shell input keyevent 82        # 弹出 Reload / DevTools 等菜单
```

---

## 4. 场景 C：调试原生层（Android Studio）

只有当问题在**原生**时才用——例如原生模块没链接上、gradle 构建失败、ExoPlayer 内部报错
（如 `ERROR_CODE_IO_FILE_NOT_FOUND`）、需要 Java/Kotlin 断点。

- 用 Android Studio **打开 `apps/mobile/android` 目录**作为工程。
- **Logcat 面板**：按包名 `com.anonymous.auroramobile` 过滤，比命令行 `adb logcat` 更清晰。
- **Build 面板**：gradle 编译错误、autolinking 结果看这里。
- 命令行等价物（不进 IDE 也能重建安装）：
  ```bash
  cd apps/mobile/android && ./gradlew :app:installDebug
  ```

---

## 5. 高频坑（今天真实踩过，务必记住）

1. **新增/升级「原生模块」后，必须重建原生 app**，JS reload 无效。
   - 原生模块 = 带 Android/iOS 代码的包（如 `expo-file-system`、`react-native-video`）。
   - 重建：`pnpm exec expo run:android`（配置 "Run Android App"）或
     `apps/mobile/android/ && ./gradlew :app:installDebug`。
2. **新装任何 npm 包后，Metro 必须带 `--clear` 重启**，否则 `import('新包')` 在打包期解析失败。
   - 现象：明明装了包，代码里 import 却报 unavailable。→ `expo start --dev-client --clear`。
3. **demo 媒体必须以 app 身份拷进私有目录**，不能 push 到 `/sdcard`（会 EACCES）。
   - 用脚本：`apps/mobile/scripts/fetch-demo-media.ps1 -Push`（内部走 `adb push` +
     `run-as <pkg> cp files/`）。app 读取的是 `FileSystem.documentDirectory`
     （= `/data/data/<pkg>/files/`），不是 PC 上的 `.demo-assets/`（那只是暂存区）。
   - 查设备实际有啥：`adb shell run-as com.anonymous.auroramobile ls -la files/`
4. **Expo SDK 54+ 把 file-system 的函数式 API 挪到了 `expo-file-system/legacy`**。
   基础模块导出的是新的 `File`/`Directory` 类；`documentDirectory` / `readAsStringAsync` /
   `readDirectoryAsync` 要从 `/legacy` 子路径拿。
5. **pnpm install 的 hoist 坑**（见 §1）：装完自检 `node -e "require.resolve('typescript')"`。
6. **`.tsx` 不进 CI**：只被 eslint 检查，不做 typecheck、不进 vitest 覆盖；真机绑定叶子的正确性
   要在真机上验。纯逻辑请尽量留在 `.ts` 核心里，用场景 A 保证。

---

## 6. 命令速查

```bash
# 质量门禁（提交前）
cd aurora-player
pnpm exec nx run-many -t typecheck lint test
pnpm test:boundaries

# 纯逻辑调试（Node）
pnpm exec nx test mobile
pnpm exec vitest run demo-media        # 在 apps/mobile 目录下，跑单个 suite

# 真机（改 .tsx / 排查 UI）
cd apps/mobile
pnpm exec expo start --dev-client --clear     # 启 Metro（新装包后必须 --clear）
pnpm exec expo run:android                     # 重建原生并安装（新增原生模块后用）

# 设备排查
adb devices
adb logcat -s ReactNativeJS:V
adb shell run-as com.anonymous.auroramobile ls -la files/
apps/mobile/scripts/fetch-demo-media.ps1 -Push
```

---

## 7. 提交约定

- 只做**加法式**改动（OCP）：新能力走新文件 / 新导出 / 可选字段，不破坏既有端口行为。
- 遵守架构边界：`scope:core` 不得 import 平台库；平台依赖只在组合根（`apps/*`）。
- 密钥 / token / 模型路径 / 后端凭据**一律不入库**（走本地环境变量或未追踪文件，仓库内只放
  `.example` 与占位）。
- 不用 `Date.now()` 做逻辑时钟（注入 `now:()=>number` 或 Clock）。
- 控制单个文件的行数。
