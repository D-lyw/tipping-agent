# GitHub API配置指南

为了解决GitHub API速率限制导致的RFC文档获取失败问题，我们添加了GitHub API认证支持。通过配置GitHub令牌，可以将API请求速率从未认证状态的每小时60次提高到已认证状态的每小时5000次。

## 为什么需要GitHub令牌

在抓取RFC文档时，我们会使用GitHub API来获取目录结构和文件内容。由于GitHub对API请求有速率限制，当短时间内请求过多时会导致以下错误：

```
获取RFC目录 0007-scoring-system-and-network-security 内容失败
获取RFC目录 0008-serialization 内容失败
...
```

配置GitHub令牌可以显著提高API请求的速率限制，从而确保文档抓取的完整性。

## 如何获取GitHub令牌

1. 登录你的GitHub账号
2. 访问 [https://github.com/settings/tokens](https://github.com/settings/tokens)
3. 点击 "Generate new token" 下的 "Generate new token (classic)"
4. 填写令牌描述，例如："CKB Docs API Token"
5. 在权限选择中，只需勾选 "public_repo" 权限即可（这是最小权限原则）
6. 点击页面底部的 "Generate token" 按钮
7. **重要**: 保存生成的令牌字符串，因为离开页面后将无法再次查看它

## 如何配置GitHub令牌

1. 编辑项目根目录中的 `.env` 文件
2. 找到 `GITHUB_TOKEN=` 这一行
3. 在等号后面粘贴你的GitHub令牌，不要添加任何空格或引号
4. 保存文件

配置示例：

```
GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz123456
```

## 验证配置是否生效

配置完成后，可以使用以下命令验证令牌是否生效：

```bash
tsx src/lib/ckbDocuments.ts github-status
```

正确配置后，你应该能看到类似以下信息：

```
检查GitHub API状态...
GitHub API状态:
认证状态: 已认证
总速率限制: 5000 请求/小时
已使用: 1 请求
剩余: 4999 请求
重置时间: 2023-08-10 12:34:56

各资源限制:
- core: 4999/5000
- search: 29/30
- graphql: 4993/5000
- ...
```

如果显示"未认证"或速率限制仍为60，请检查令牌是否正确设置。

## 重新获取所有文档

配置好GitHub令牌后，建议清理并重新获取所有文档，以确保完整获取RFC文档：

```bash
tsx src/cli/ckb-docs-manager.ts clean
```

## 注意事项

1. 不要将GitHub令牌提交到公共仓库中
2. 如果你在多台设备上部署，需要在每台设备上配置令牌
3. 令牌有过期时间，如果过期需要重新生成
4. 即使有令牌，仍然应当合理控制API请求频率，避免触发GitHub的滥用保护机制 