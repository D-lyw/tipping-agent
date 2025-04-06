if (process.env.npm_execpath.indexOf('pnpm') === -1) {
  console.error('请使用 pnpm 作为包管理器');
  process.exit(1);
} 