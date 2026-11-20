// Check that moving the page does not change calendar work or browser actions.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const acorn = require('./vendor/acorn.cjs');
const src = path.join(__dirname, '../src');
const current = fs.readFileSync(path.join(src, 'Code.gs'), 'utf8');
const previous = fs.readFileSync(
  path.join(__dirname, 'fixtures/pre-readable-Code.gs.txt'),
  'utf8'
);
const parse = (code) => acorn.parse(code, { ecmaVersion: 2022 });
const clean = (node) =>
  JSON.parse(
    JSON.stringify(node, (key, value) =>
      ['start', 'end', 'raw'].includes(key) ? undefined : value
    )
  );
const withoutPage = (code) =>
  clean(
    parse(code).body.filter((node) => {
      if (
        node.type === 'FunctionDeclaration' &&
        ['doGet', 'monitor_', 'getAdminStatus', 'safeMonitorRecord_'].includes(
          node.id.name
        )
      )
        return false;
      return !(
        node.type === 'VariableDeclaration' &&
        node.declarations.some((d) => d.id.name === 'WEB_HTML')
      );
    })
  );
assert.deepEqual(
  withoutPage(current),
  withoutPage(previous),
  'The cleanup must not change any non-page backend logic'
);
console.log(
  'PASS All calendar/backend logic outside HTML loading and admin reporting matches the dashboard version before formatting.'
);

const oldContext = vm.createContext({});
vm.runInContext(previous, oldContext);
const oldHTML = vm.runInContext('WEB_HTML', oldContext);
const html = fs.readFileSync(path.join(src, 'Index.html'), 'utf8');
const script = (value) => value.match(/<script>([\s\S]*?)<\/script>/i)[1];
assert.deepEqual(
  clean(parse(script(html))),
  clean(parse(script(oldHTML))),
  'Browser actions must not change when extracting the page'
);
assert.ok(!current.includes('const WEB_HTML'));
assert.ok(!html.includes('String.raw`'));
console.log(
  'PASS Index.html keeps the same browser JavaScript and server calls.'
);

let account = 'teacher@lfanet.org';
const context = vm.createContext({
  Session: {
    getEffectiveUser: () => ({ getEmail: () => account }),
    getActiveUser: () => ({ getEmail: () => account })
  },
  HtmlService: {
    createTemplateFromFile(file) {
      return {
        isAdmin: false,
        evaluate() {
          const output = context.HtmlService.createHtmlOutputFromFile(file);
          output.contents = output.contents.replace(
            /<\? if \(isAdmin\) \{ \?>([\s\S]*?)<\? \} \?>/g,
            (_whole, body) => (this.isAdmin ? body : '')
          );
          return output;
        }
      };
    },
    createHtmlOutputFromFile(file) {
      const contents = fs.readFileSync(path.join(src, file + '.html'), 'utf8');
      return {
        file,
        contents,
        setTitle(title) {
          this.title = title;
          return this;
        },
        addMetaTag() {
          return this;
        }
      };
    }
  }
});
vm.runInContext(current, context);
assert.equal(context.doGet().file, 'Index');
assert.ok(!context.doGet().contents.includes('id="adminLink"'));
assert.ok(!context.doGet().contents.includes('Admin diagnostics ↗'));
assert.throws(
  () => context.doGet({ parameter: { admin: '1' } }),
  /administrator/
);
account = 'seoyeon.choi@lfanet.org';
assert.ok(context.doGet().contents.includes('id="adminLink"'));
assert.equal(context.doGet({ parameter: { admin: '1' } }).file, 'Admin');
assert.equal(context.doGet({ parameter: {} }).file, 'Index');
account = 'other@gmail.com';
assert.throws(() => context.doGet(), /LFA/);
console.log(
  'PASS Normal users load Index.html; only the approved admin can load Admin.html; non-LFA users are rejected.'
);
