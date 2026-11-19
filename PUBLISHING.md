# 发布清单 · Publishing

本仓库已经准备好：插件源码、`market/index.json`（format 1）、`v0.2.0` tag 和远端 `origin` 都已就位。只差把提交推到 GitHub，并把仓库暴露给市场索引。

## 1. 创建 GitHub 仓库并推送

在 GitHub 创建 **public** 空仓库：

```
https://github.com/Dzy-HW-XD/dsh-sci-sideband
```

不要勾选 “Add a README”。然后在仓库目录执行：

```powershell
cd C:\Users\duziyu\Documents\deepseek-harness\default-workspace\dsh-sci-sideband
git push -u origin main
git push origin v0.2.0
```

第一次 push 时 Git Credential Manager 会要求登录 GitHub；登录后本机即可继续推送后续版本。

## 2. 让插件市场发现仓库

在 GitHub 仓库的 **About → Topics** 添加：

```
dsh-plugin
deepseek-harness
dsh
research
```

`dshopen.org` / `dsh.so` 等社区索引会扫描带 `dsh-plugin` 话题的仓库；这是没有统一提交入口时最直接的收录方式。

## 3. 使用自托管市场索引

仓库公开后，索引地址是：

```
https://raw.githubusercontent.com/Dzy-HW-XD/dsh-sci-sideband/main/market/index.json
```

在 DSH 里：**设置 → 插件 → 发现 → 索引源 → 添加**，粘贴上面的 URL。之后即可在「发现」里安装/升级 `dsh-sci-sideband`。

索引里的版本源固定到 `v0.2.0` 对应的 commit；发布新版本时：

```powershell
# 1) 改 package.json 版本并提交
git add -A
git commit -m "release: v0.2.1"
git tag v0.2.1
# 2) 生成索引（本地/CI 能正常调用 git 时）
node scripts/make-market-index.mjs --commit v0.2.1
# 3) 提交索引并推送
git add market/index.json
git commit -m "chore: update market index"
git push
git push origin v0.2.1
```

如果运行环境禁止 Node 启动 git 子进程，可显式传入：

```powershell
node scripts/make-market-index.mjs --commit <40位sha> --epoch <unix秒>
```

## 4. 提交到社区市场（可选）

社区没有统一的“提交按钮”；常见做法是：

- 给仓库加 `dsh-plugin` 话题，等待 `dshopen.org` / `dsh.so` 扫描；
- 或到 `https://www.dsh.so/zh/submit/` 粘贴仓库地址，让检查器生成市场条目；
- 或向上游市场索引仓库提 PR，加入 `market/index.json` 的条目。

提交时使用 README 里的定位：**科研探索边带，不执行实验、不处理原始实验数据；生成实验建议与综述论述。**

## 5. npm 发布（可选）

若希望用户用 npm 源安装而不走 git：

```powershell
npm login
npm publish --access public
```

包名 `dsh-sci-sideband` 当前在 npm 上未占用。发布后把 `market/index.json` 的 `source` 改成 `{ "type": "npm" }`，或同时保留 git 源。

## 6. 发布后验证

- 在 DSH 里添加索引 URL，确认「发现」出现 **科研探索边带**，版本 `0.2.0`，可安装。
- 安装后左侧栏出现 **科研探索边带**；新建项目、加一条内容、跑后台探索、生成实验建议，确认全链路。
- 确认仓库 README、`market/index.json`、`v0.2.0` tag 指向同一个版本。
