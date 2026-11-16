export function checkBundles(metadata, scripts) {
  const errors = [];
  for (const [name, output] of Object.entries(metadata.outputs)) {
    if (!name.endsWith(".js")) continue;
    const inputs = Object.keys(output.inputs);
    if (inputs.some((file) => /^(tests|experiments)\//.test(file)))
      errors.push(`${name}: test or experiment code was bundled`);
    if (
      name.endsWith("/background.js") &&
      inputs.some(
        (file) => file.includes("/ui/") || file.includes("/offscreen/"),
      )
    )
      errors.push(`${name}: worker depends on a DOM/UI context`);
    if (
      /ModsTest|ModsUiFixture|globalThis\.runtime|importScripts\(/.test(
        scripts[name] ?? "",
      )
    )
      errors.push(`${name}: legacy or test runtime bridge was emitted`);
  }
  return errors;
}
