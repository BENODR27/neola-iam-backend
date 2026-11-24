const test = require("node:test");
const assert = require("node:assert/strict");
const {
  defaultTheme,
  validateTheme,
  contrast,
} = require("../src/services/appearance-validation");
test("appearance accepts only safe typed palettes and readable text", () => {
  assert.deepEqual(validateTheme(defaultTheme), defaultTheme);
  assert.equal(contrast("#ffffff", "#000000"), 21);
  for (const change of [
    { font: "url(https://untrusted)" },
    { cardRadius: -1 },
    { defaultMode: "automatic" },
    { light: { ...defaultTheme.light, surface: "url(example)" } },
    { dark: { ...defaultTheme.dark, text: defaultTheme.dark.surface } },
    {
      light: { ...defaultTheme.light, sidebarText: defaultTheme.light.sidebar },
    },
  ])
    assert.throws(
      () => validateTheme({ ...defaultTheme, ...change }),
      (error) => error.status === 422,
    );
  const theme = validateTheme({
    ...defaultTheme,
    injected: "ignored",
    light: { ...defaultTheme.light, unsafe: "ignored" },
  });
  assert.equal(theme.injected, undefined);
  assert.equal(theme.light.unsafe, undefined);
});
