// Ds 编译器内核本地测试（Node）
const path = require('path');
const Ds = require(path.join(__dirname, '..', 'app/src/main/assets/ds.js'));

let pass = 0, fail = 0;
function expect(name, src, want, opts) {
  const r = Ds.run(src, opts);
  const text = r.output.map(o => o.s).join('');
  if (text === want) { pass++; }
  else { fail++; console.log(`✗ ${name}\n  want=${JSON.stringify(want)}\n  got =${JSON.stringify(text)}${r.ok ? '' : ' err=' + JSON.stringify(r.error)}`); }
}
function expectError(name, src, contains, opts) {
  const r = Ds.run(src, opts);
  if (!r.ok && r.error.message.includes(contains)) pass++;
  else { fail++; console.log(`✗ ${name} 期望错误包含 ${contains}，实际 ok=${r.ok} ${JSON.stringify(r.error)}`); }
}
function expectCheck(name, src, wantOk, opts) {
  const r = Ds.check(src, opts);
  if (r.ok === wantOk) pass++;
  else { fail++; console.log(`✗ ${name} 期望 check.ok=${wantOk}，实际 ${JSON.stringify(r)}`); }
}

expect('hello', 'package t\nfn main() { println("hi") }', 'hi\n');
expect('arith', 'fn main() { println(1 + 2 * 3 - 4 / 2) }', '5\n');
expect('recursion', 'fn fib(n: i32) -> i32 { if n < 2 { n } else { fib(n-1) + fib(n-2) } }\nfn main() { println(fib(10)) }', '55\n');
expect('array', 'fn main() { let xs = [1 2 3]; println(xs); xs[1] = 9; println(xs[1]) }', '[1 2 3]\n9\n');
expect('map', 'fn main() { let m = {"a": 1, "b": 2}; println(m["b"]); m["c"] = 3; println(m["c"]) }', '2\n3\n');
expect('loop', 'fn main() { var i = 0; loop { i = i + 1; if i >= 3 { break } }; println(i) }', '3\n');
expect('while-for', 'fn main() { var s = 0; for v in [1 2 3] { s = s + v }; while s < 10 { s = s + 1 }; println(s) }', '10\n');
expect('pipe', 'fn inc(x: i32) -> i32 { x + 1 }\nfn dbl(x: i32) -> i32 { x * 2 }\nfn main() { println(5 |> inc |> dbl) }', '12\n');
expect('concat', 'fn main() { println("ab" + "cd"); println(5 |> str) }', 'abcd\n5\n');
expect('builtins', 'fn main() { println(len([1 2 3])); println(range(0, 5)); println(math.sqrt(81.0)); println(math.round(3.6)) }', '3\n[0 1 2 3 4]\n9.0\n4.0\n');
expect('format', 'fn main() { println(format("x={} y={}", 1, 2)) }', 'x=1 y=2\n');
expect('bool', 'fn main() { println(true && !false); println((1 << 4) | 3) }', 'true\n19\n');
expect('loop-expr', 'fn main() { let n = loop { break 42 }; println(n) }', '42\n');
expect('globals', 'var counter = 0\nfn bump() { counter = counter + 1; counter }\nfn main() { println(bump()); println(bump()) }', '1\n2\n');
expect('defaults', 'fn f(x: i32, k: i32 = 2) -> i32 { x * k }\nfn main() { println(f(5)); println(f(5, 3)) }', '10\n15\n');
expectError('type-error', 'fn main() { println(1 + "a") }', '类型');
expectError('undefined', 'fn main() { println(nope) }', '未定义');
expectError('div0', 'fn main() { println(1 / 0) }', '除数为 0');
expectError('syntax', 'fn main( { }', '期望');
expectError('unsupported', 'class A { }\nfn main() { }', '暂不支持');
expectError('infinite-guard', 'fn main() { loop { } }', '步数');

/* ---------- 0.1c 精简写法 ---------- */
expect('implicit-entry', 'println("hi")\nprintln(1 + 2)', 'hi\n3\n');
expect('implicit-hoist', 'println(later(4))\nfn later(x) = x * 2', '8\n');
expect('auto-main', 'fn main() { println("auto") }', 'auto\n');
expect('no-auto-main', 'fn main() { println("main") }\nprintln("top")', 'top\n');
expect('expr-fn', 'fn add(a,b)=a+b\nprintln(add(2,3))', '5\n');
expect('colon-fn', 'fn say(x): println(x)\nsay("ok")\nsay("again")', 'ok\nagain\n');
expect('colon-if', 'if 1 < 2: println("yes")\nif 1 > 2: println("no")\nprintln("end")', 'yes\nend\n');
expect('colon-while', 'var i = 0\nwhile i < 3: i += 1\nprintln(i)', '3\n');
expect('colon-for', 'var s = 0\nfor i in 1..4: s += i\nprintln(s)', '6\n');
expect('compound-arith', 'var x = 10\nx += 5\nx -= 3\nx *= 2\nx /= 4\nx %= 4\nprintln(x)', '2\n');
expect('compound-bit', 'var b = 1\nb <<= 4\nb |= 3\nb &= 6\nb ^= 1\nb >>= 1\nprintln(b)', '1\n');
expect('compound-index', 'var xs = [1 2 3]\nxs[1] += 10\nvar m = {"k": 2}\nm["k"] *= 5\nprintln(xs)\nprintln(m["k"])', '[1 12 3]\n10\n');
expect('range', 'println(0..4)\nvar n = 3\nprintln(1..(n+2))\nfor i in 0..3: print(i)\nprintln("")', '[0 1 2 3]\n[1 2 3 4]\n012\n');
expect('fstring', 'var x = 3\nprintln(f"x={x} n={x+1} ok={x > 2}")', 'x=3 n=4 ok=true\n');
expect('fstring-braces', 'println(f"{{}} {{x}}")', '{} {x}\n');
expect('fstring-escape', 'println(f"a\\tb")', 'a\tb\n');
expect('immutable-first-read', 'x = 1\nprintln(x)', '1\n');
expectError('immutable-first-assign', 'x = 1\nx = 2', '不可变');
expectError('range-type', 'println("a".."b")', '数值');
expectCheck('classic-check', 'fn f(x)=x\nprintln(f(1))', true);

/* ---------- Flow 写法 ---------- */
expect('flow-hello', '#!flow\np "hello, Ds"', 'hello, Ds\n');
expect('flow-sum-format', '#!flow\nvar total=0\nfor i in 1..6: total+=i\np f"total={total}"', 'total=15\n');
expect('flow-fn-apply', '#!flow\n\\add a b = a + b\np (add 2 3)\np add(4 5)', '5\n9\n');
expect('flow-dot-block', '#!flow\n\\add a b\n  a + b\n.\np (add 2 3)', '5\n');
expect('flow-dot-nested', '#!flow\n\\g n\n  ? n > 0\n    p "big"\n  .\n  p "done"\n.\ng(1)\ng(0)', 'big\ndone\ndone\n');
expect('flow-while-dot', '#!flow\n\\count n\n  var i = 0\n  while i < n\n    i += 1\n  .\n  i\n.\np count(3)', '3\n');
expect('flow-fib', '#!flow\n\\fib n = ?n<2: n; fib(n-1)+fib(n-2)\np fib(10)', '55\n');
expect('flow-caret', '#!flow\n\\f x\n  ? x > 0: ^ "pos"\n  ^ "neg"\n.\np (f 1)\np f(-1)', 'pos\nneg\n');
expect('flow-else', '#!flow\n\\sign n\n  ? n > 0: "pos"\n  else ? n < 0: "neg"\n  else: "zero"\n.\np sign(3)\np sign(-3)\np sign(0)', 'pos\nneg\nzero\n');
expect('flow-mix', '#!flow\nfn sq(x: i32) -> i32 { x * x }\n\\inc x = x + 1\nlet a = 2\nvar b = a + 1\np sq(inc(4))\np (b * 2)', '25\n6\n');
expect('flow-brace-if', '#!flow\n\\f x\n  ? x > 0 {\n    p "pos"\n  } else {\n    p "neg"\n  }\n.\nf(1)\nf(-1)', 'pos\nneg\n');
expect('flow-unary-arg', '#!flow\np -3', '-3\n');
expect('flow-aliases', '#!flow\np (l [1 2 3])\np (s 42)\np (r 3)', '3\n42\n[0 1 2]\n');
expect('flow-typed-params', '#!flow\n\\add a:i32 b:i32 -> i32 = a + b\np add(2 3)', '5\n');
expect('flow-dsf', '\\id x = x\np id(9)', '9\n', { filename: 'prog.dsf' });
expect('flow-backslash-entry', '\\add a b = a + b\np add(2 3)', '5\n');
expectError('flow-missing-dot', '#!flow\n\\f x\n  x', "'.'");
expectCheck('flow-check', '#!flow\np (f 1)', true);
expectCheck('flow-check-bad', '#!flow\n\\f x = x\np (f 1', false);

if (fail === 0) { console.log(`✓ 内核测试全部通过（${pass} 项）`); process.exit(0); }
console.log(`✗ ${fail} 项失败`); process.exit(1);
