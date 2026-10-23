
const path = require("node:path");
(async () => {
  const { packager } = await import("@electron/packager");
  for (const platform of ["win32", "darwin"]) {
    const results = await packager({ dir: path.resolve(__dirname,".."), out:path.resolve(__dirname,"../../dist"), appBundleId:"local.explainonimage.desktop", name:"ExplainOnImage", platform, arch:platform==="win32"?"x64":"arm64", electronVersion:require("../package.json").devDependencies.electron, overwrite:true, asar:true, prune:true, ignore:[/^\/tests($|\/)/,/^\/scripts($|\/)/,/^\/verification-profile($|\/)/], win32metadata:{CompanyName:"ExplainOnImage",FileDescription:"ExplainOnImage — capturas para tutoriales",ProductName:"ExplainOnImage",OriginalFilename:"ExplainOnImage.exe"} });
    console.log(platform, results);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
