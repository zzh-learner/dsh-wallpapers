# dsh-wallpapers

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）的壁纸插件组合包：壁纸注册表 + 思考球体 + GARGANTUA 黑洞。

- **壁纸注册表** —— 页面级 `wallpaper.registry` 服务，背景层向它注册；设置 → 壁纸 分区负责列出与切换，选择持久化在 localStorage。
- **思考球体** —— 居中主视觉画布，按会话实时相位（进行中的工具名、流式位、回合结果）渲染对应模式，数据来自 `orbActivity` 会话投影；可折叠面板支持相位→模式映射、闲置模式、密度/速度/尺寸。
- **GARGANTUA 黑洞** —— 零依赖 WebGL2 黑洞光线追踪（引力透镜、吸积盘、泛光），半透明背景层，自带控制面板。

宿主半边通过 session-projection 接口注册 `orbActivity` 投影；浏览器半边是全部 UI。通过注册表隐藏壁纸会暂停其渲染循环。

## 安装

需要 `dsh` CLI。装入 `web` profile（或其他 profile 名）：

```sh
dsh plugin --profile web add github:zzh-learner/dsh-wallpapers
```

`dsh` 的调用形式取决于 DeepSeek Harness 的安装方式：

- npm 全局安装（`npm i -g @deepseek-ai/dsh`）：按上文的 `dsh ...` 直接使用。
- 免安装：加 npx 前缀 —— `npx @deepseek-ai/dsh plugin --profile web add ...`。
- 源码检出：在仓库根目录用 `pnpm dsh ...` 调用 —— 检出本身不会把 `dsh` 放进 PATH。

安装过程不运行任何构建脚本：`lib/` 与 `client/` 产物直接提交在仓库里，包内刻意不设 `prepare` 脚本，pnpm ≥ 10 无脚本可拦——不需要任何 `allowBuilds` 授权。CI 会在每次推送时校验已提交产物与 `pnpm run build` 一致。

锁定 commit 用 `github:zzh-learner/dsh-wallpapers#<sha>`，避免后续推送悄悄改变实际运行内容。

验证层并启动：

```sh
dsh --profile web --dump-config   # 应出现 "# == dsh-wallpapers" 层
dsh --profile web
```

## 开发

```sh
pnpm install
pnpm run build       # tsdown：lib/（宿主半边）+ client/（浏览器 bundle）
pnpm run typecheck
```

源码布局：`src/index.ts` 是宿主半边（投影注册）；`src/client/` 是浏览器半边（注册表、设置分区、球体、黑洞）。client bundle 是包裹 `window.__ModuleLoader__.load` 的闭包工厂产物，react 经 loader 模块表外部化——即 harness 客户端预设的外部包移植。

## 许可

MIT
