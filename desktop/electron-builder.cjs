const path=require('node:path');
module.exports={
 appId:'com.soryuu.writingworkbench',productName:'写作台',electronVersion:'44.5.1',
 directories:{app:'protected',output:'release'},
 electronDist:path.join(__dirname,'node_modules/electron/dist'),
 files:['**/*'],asar:true,npmRebuild:false,
 win:{target:[{target:'nsis',arch:['x64']}],executableName:'WritingWorkbench',signExecutable:false,icon:path.join(__dirname,'../src-tauri/icons/icon.ico')},
 nsis:{oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,deleteAppDataOnUninstall:false,runAfterFinish:false,createDesktopShortcut:true,createStartMenuShortcut:true,shortcutName:'写作台',include:path.join(__dirname,'installer.nsh'),artifactName:'WritingWorkbench-Setup-${version}-${arch}.${ext}'},
 publish:null
};
