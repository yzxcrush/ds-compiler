// Ds 编译器内核本地测试（Node）
const path = require('path');
const Ds = require(path.join(__dirname, '..', 'app/src/main/assets/ds.js'));

let pass = 0, fail = 0;
function expect(name, src, want) {
  const r = Ds.run(src);
  const text = r.output.map(o => o.s).join('');
  if (text === want) { pass++; }
  else { fail++; console.log(`✗ ${name}\n  want=${JSON.stringify(want)}\n  got =${JSON.stringify(text)}${r.ok ? '' : ' err=' + JSON.stringify(r.error)}`); }
}
function expectError(name, src, contains) {
  const r = Ds.run(src);
  if (!r.ok && r.error.message.includes(contains)) pass++;
  else { fail++; console.log(`✗ ${name} 期望错误包含 ${contains}，实际 ok=${r.ok} ${JSON.stringify(r.error)}`); }
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

if (fail === 0) { console.log(`✓ 内核测试全部通过（${pass} 项）`); process.exit(0); }
console.log(`✗ ${fail} 项失败`); process.exit(1);
