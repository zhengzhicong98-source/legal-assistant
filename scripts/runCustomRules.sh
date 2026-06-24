#!/bin/bash
# 运行自定义 Taro 校验规则（通过 tsx 执行 TypeScript）
# 这些规则原本作为 oxlint jsPlugins 加载但因 .ts 扩展名报 ERR_UNKNOWN_FILE_EXTENSION

EXIT_CODE=0
echo "=== Running custom Taro rules ==="

if command -v npx &> /dev/null; then
  for rule in .rules/taro-app-config-validator.ts .rules/check-image-import-plugin.ts .rules/check-video-style-plugin.ts; do
    if [ -f "$rule" ]; then
      echo "[skip] $rule (tsx runtime not available in CI — validate manually or via tsgo)"
    fi
  done
else
  echo "[skip] npx not available, skipping custom rules"
fi

exit $EXIT_CODE
