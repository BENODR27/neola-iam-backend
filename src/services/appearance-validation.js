const HttpError = require("../errors/HttpError");
const defaultTheme = Object.freeze({
  defaultMode: "system",
  font: "system",
  cardRadius: 14,
  light: {
    primary: "#365fbd",
    background: "#f3f6fb",
    surface: "#ffffff",
    surfaceAlt: "#edf2f9",
    text: "#202e45",
    muted: "#64748b",
    border: "#dce4ef",
    sidebar: "#19283f",
    sidebarText: "#edf3ff",
  },
  dark: {
    primary: "#8caeff",
    background: "#101722",
    surface: "#192332",
    surfaceAlt: "#223045",
    text: "#edf2fa",
    muted: "#a5b4ca",
    border: "#35455e",
    sidebar: "#0c1420",
    sidebarText: "#edf3ff",
  },
});
function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/../g)
    .map((value) => {
      const n = parseInt(value, 16) / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function validateTheme(input) {
  if (
    !input ||
    !["light", "dark", "system"].includes(input.defaultMode) ||
    !["system", "arial", "roboto", "serif"].includes(input.font) ||
    !Number.isInteger(input.cardRadius) ||
    input.cardRadius < 0 ||
    input.cardRadius > 28
  )
    throw new HttpError(
      422,
      "Choose a mode, font and card radius between 0 and 28",
    );
  const result = {
    defaultMode: input.defaultMode,
    font: input.font,
    cardRadius: input.cardRadius,
  };
  for (const mode of ["light", "dark"]) {
    const palette = input[mode];
    if (
      !palette ||
      !Object.keys(defaultTheme[mode]).every(
        (key) =>
          typeof palette[key] === "string" &&
          /^#[a-fA-F0-9]{6}$/.test(palette[key]),
      )
    )
      throw new HttpError(
        422,
        "Every palette color must be a six-digit hex color",
      );
    result[mode] = Object.fromEntries(
      Object.keys(defaultTheme[mode]).map((key) => [
        key,
        palette[key].toLowerCase(),
      ]),
    );
    if (
      contrast(palette.text, palette.surface) < 4.5 ||
      contrast(palette.text, palette.background) < 4.5 ||
      contrast(palette.text, palette.surfaceAlt) < 4.5 ||
      contrast(palette.sidebarText, palette.sidebar) < 4.5
    )
      throw new HttpError(
        422,
        "Text must have at least 4.5:1 contrast against page, card and sidebar backgrounds",
      );
  }
  return result;
}
module.exports = { defaultTheme, validateTheme, contrast };
