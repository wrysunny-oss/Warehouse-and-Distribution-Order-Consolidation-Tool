'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const browserModule = file => read(file).replace(/^'use strict';\s*/, '').replace(/\nmodule\.exports = [^\n]+;\s*$/, '');
function buildUserscript() {
  const engine = [
    browserModule('src/services/competitor-review-service.js'),
    browserModule('src/services/competitor-browser-review-observer.js'),
    require('../src/services/crawler-verification').detectVerification.toString(),
    read('scripts/tampermonkey/detail-reviews.js')
  ].join('\n\n');
  const template = read('scripts/tampermonkey/taobao_factory_crawler.template.js');
  if (!template.includes('/*__REVIEW_ENGINE__*/')) throw new Error('Userscript template marker missing');
  return template.replace('/*__REVIEW_ENGINE__*/', engine);
}
if (require.main === module) {
  const target = path.join(root, 'scripts/tampermonkey/taobao_factory_crawler.js');
  const source = buildUserscript();
  if (process.argv.includes('--check')) {
    if (read('scripts/tampermonkey/taobao_factory_crawler.js') !== source) throw new Error('油猴脚本未同步，请运行 npm run build:userscript');
  } else fs.writeFileSync(target, source, 'utf8');
}
module.exports = { buildUserscript };
