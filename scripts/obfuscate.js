const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const DIRECTORY = path.join(__dirname, '../build/chrome-mv3');

function obfuscateDirectory(directory) {
  if (!fs.existsSync(directory)) {
    console.log('🚨 Build directory not found, skipping obfuscation.');
    return;
  }
  
  const files = fs.readdirSync(directory);
  files.forEach(file => {
    const fullPath = path.join(directory, file);
    if (fs.lstatSync(fullPath).isDirectory()) {
      obfuscateDirectory(fullPath);
    } else if (file.endsWith('.js')) {
      const source = fs.readFileSync(fullPath, 'utf8');
      
      try {
        const obfuscationResult = JavaScriptObfuscator.obfuscate(source, {
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.75,
          deadCodeInjection: true,
          deadCodeInjectionThreshold: 0.4,
          stringArray: true,
          stringArrayEncoding: ['base64'],
          stringArrayThreshold: 0.75,
          disableConsoleOutput: false 
        });
        
        fs.writeFileSync(fullPath, obfuscationResult.getObfuscatedCode());
        console.log(`🔒 Archivo Blindado: ${file}`);
      } catch (err) {
        console.error(`Error obfuscating ${file}:`, err);
      }
    }
  });
}

console.log('Iniciando Enterprise Obfuscator...');
obfuscateDirectory(DIRECTORY);
console.log('✅ ¡Construcción cifrada con éxito!');
