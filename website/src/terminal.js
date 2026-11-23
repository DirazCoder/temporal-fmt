(() => {
const identifier = /^[A-Za-z_$][\w$]*$/;
const forbiddenProperties = new Set([
  '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
  '__proto__', 'arguments', 'callee', 'caller', 'constructor', 'prototype',
]);
const precedence = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '===': 3,
  '!==': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

function tokenize(source) {
  if (source.length > 8000) throw new SyntaxError('Expression is too long.');
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const rest = source.slice(index);
    if (/^\s/.test(rest)) {
      index += rest.match(/^\s+/)[0].length;
      continue;
    }

    const char = source[index];
    if (char === "'" || char === '"') {
      const quote = char;
      let value = '';
      index++;
      let closed = false;
      while (index < source.length) {
        const next = source[index++];
        if (next === quote) {
          closed = true;
          break;
        }
        if (next === '\n' || next === '\r') throw new SyntaxError('Strings cannot contain raw line breaks.');
        if (next !== '\\') {
          value += next;
          continue;
        }

        const escaped = source[index++];
        const escapes = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', '"': '"', "'": "'" };
        if (Object.prototype.hasOwnProperty.call(escapes, escaped)) {
          value += escapes[escaped];
        } else if (escaped === 'u') {
          const code = source.slice(index, index + 4);
          if (!/^[\da-f]{4}$/i.test(code)) throw new SyntaxError('Invalid unicode escape.');
          value += String.fromCharCode(parseInt(code, 16));
          index += 4;
        } else {
          throw new SyntaxError('Unsupported string escape: \\' + escaped);
        }
      }
      if (!closed) throw new SyntaxError('Unterminated string.');
      tokens.push({ type: 'literal', value });
      continue;
    }

    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(rest);
    if (number) {
      tokens.push({ type: 'literal', value: Number(number[0]) });
      index += number[0].length;
      continue;
    }

    const name = /^[A-Za-z_$][\w$]*/.exec(rest);
    if (name) {
      tokens.push({ type: 'identifier', value: name[0] });
      index += name[0].length;
      continue;
    }

    const operator = ['===', '!==', '=>', '>=', '<=', '&&', '||', '==', '!=', '+', '-', '*', '/', '%', '>', '<', '!']
      .find((candidate) => rest.startsWith(candidate));
    if (operator) {
      tokens.push({ type: 'operator', value: operator });
      index += operator.length;
      continue;
    }

    if ('()[]{},.:'.includes(char)) {
      tokens.push({ type: 'punctuation', value: char });
      index++;
      continue;
    }

    throw new SyntaxError(`Unexpected character "${char}".`);
  }

  if (tokens.length > 1000) throw new SyntaxError('Expression has too many parts.');
  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
    this.depth = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.index + offset];
  }

  take(value) {
    if (this.peek().value !== value) return false;
    this.index++;
    return true;
  }

  expect(value) {
    if (!this.take(value)) throw new SyntaxError(`Expected "${value}".`);
  }

  parse() {
    const expression = this.parseExpression();
    if (this.peek().type !== 'eof') throw new SyntaxError(`Unexpected token "${this.peek().value}".`);
    return expression;
  }

  parseExpression(minimumPrecedence = 0) {
    if (++this.depth > 100) throw new SyntaxError('Expression is nested too deeply.');
    try {
      let left = this.parseUnary();
      while (this.peek().type === 'operator' && (precedence[this.peek().value] || 0) > minimumPrecedence) {
        const operator = this.peek().value;
        const operatorPrecedence = precedence[operator];
        this.index++;
        const right = this.parseExpression(operatorPrecedence);
        left = { type: 'binary', operator, left, right };
      }
      return left;
    } finally {
      this.depth--;
    }
  }

  parseUnary() {
    if (['!', '+', '-'].includes(this.peek().value)) {
      const operator = this.peek().value;
      this.index++;
      return { type: 'unary', operator, argument: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  parseArrow() {
    const start = this.index;
    let parameters = [];

    if (this.peek().type === 'identifier' && this.peek(1).value === '=>') {
      parameters = [this.peek().value];
      this.index += 2;
      return { type: 'arrow', parameters, body: this.parseExpression() };
    }

    if (!this.take('(')) return null;
    if (!this.take(')')) {
      while (true) {
        if (this.peek().type !== 'identifier') {
          this.index = start;
          return null;
        }
        parameters.push(this.peek().value);
        this.index++;
        if (this.take(')')) break;
        if (!this.take(',')) {
          this.index = start;
          return null;
        }
      }
    }
    if (!this.take('=>')) {
      this.index = start;
      return null;
    }
    return { type: 'arrow', parameters, body: this.parseExpression() };
  }

  parsePostfix() {
    let value = this.parsePrimary();
    while (true) {
      if (this.take('.')) {
        if (this.peek().type !== 'identifier') throw new SyntaxError('Expected a property name.');
        value = { type: 'member', object: value, property: { type: 'literal', value: this.peek().value } };
        this.index++;
      } else if (this.take('[')) {
        const property = this.parseExpression();
        this.expect(']');
        value = { type: 'member', object: value, property };
      } else if (this.take('(')) {
        const args = [];
        if (!this.take(')')) {
          do { args.push(this.parseExpression()); } while (this.take(','));
          this.expect(')');
        }
        value = { type: 'call', callee: value, args };
      } else {
        return value;
      }
    }
  }

  parsePrimary() {
    const arrow = this.parseArrow();
    if (arrow) return arrow;

    const token = this.peek();
    if (token.type === 'literal') {
      this.index++;
      return token;
    }
    if (token.type === 'identifier') {
      this.index++;
      if (token.value === 'true') return { type: 'literal', value: true };
      if (token.value === 'false') return { type: 'literal', value: false };
      if (token.value === 'null') return { type: 'literal', value: null };
      if (token.value === 'undefined') return { type: 'literal', value: undefined };
      return { type: 'identifier', name: token.value };
    }
    if (this.take('(')) {
      const expression = this.parseExpression();
      this.expect(')');
      return expression;
    }
    if (this.take('[')) {
      const elements = [];
      if (!this.take(']')) {
        do { elements.push(this.parseExpression()); } while (this.take(','));
        this.expect(']');
      }
      return { type: 'array', elements };
    }
    if (this.take('{')) {
      const properties = [];
      if (!this.take('}')) {
        do {
          const key = this.peek();
          if (key.type !== 'identifier' && key.type !== 'literal') throw new SyntaxError('Expected an object key.');
          this.index++;
          const propertyName = String(key.value);
          if (forbiddenProperties.has(propertyName)) throw new SyntaxError(`Property "${propertyName}" is not available.`);
          const value = this.take(':')
            ? this.parseExpression()
            : key.type === 'identifier' ? { type: 'identifier', name: propertyName } : null;
          if (!value) throw new SyntaxError('Object properties need a value.');
          properties.push({ key: propertyName, value });
        } while (this.take(','));
        this.expect('}');
      }
      return { type: 'object', properties };
    }
    throw new SyntaxError(`Unexpected token "${token.value || 'end of input'}".`);
  }
}

function lookup(scope, name) {
  for (let current = scope; current; current = Object.getPrototypeOf(current)) {
    if (Object.prototype.hasOwnProperty.call(current, name)) return current[name];
  }
  throw new ReferenceError(`Unknown name "${name}".`);
}

function property(target, key) {
  const name = String(key);
  if (forbiddenProperties.has(name)) throw new ReferenceError(`Property "${name}" is not available.`);
  if (target == null) throw new TypeError(`Cannot read "${name}" from ${target}.`);
  return Reflect.get(Object(target), name);
}

function evaluate(node, scope) {
  switch (node.type) {
    case 'literal':
      return node.value;
    case 'identifier':
      return lookup(scope, node.name);
    case 'array':
      return node.elements.map((element) => evaluate(element, scope));
    case 'object': {
      const result = {};
      node.properties.forEach(({ key, value }) => { result[key] = evaluate(value, scope); });
      return result;
    }
    case 'member':
      return property(evaluate(node.object, scope), evaluate(node.property, scope));
    case 'call': {
      const receiver = node.callee.type === 'member' ? evaluate(node.callee.object, scope) : undefined;
      const fn = node.callee.type === 'member'
        ? property(receiver, evaluate(node.callee.property, scope))
        : evaluate(node.callee, scope);
      if (typeof fn !== 'function') throw new TypeError('This expression is not callable.');
      return Reflect.apply(fn, receiver, node.args.map((argument) => evaluate(argument, scope)));
    }
    case 'arrow':
      return function (...args) {
        const local = Object.create(scope);
        node.parameters.forEach((name, index) => { local[name] = args[index]; });
        return evaluate(node.body, local);
      };
    case 'unary': {
      const value = evaluate(node.argument, scope);
      if (node.operator === '!') return !value;
      if (node.operator === '+') return +value;
      return -value;
    }
    case 'binary': {
      const left = evaluate(node.left, scope);
      if (node.operator === '&&') return left && evaluate(node.right, scope);
      if (node.operator === '||') return left || evaluate(node.right, scope);
      const right = evaluate(node.right, scope);
      switch (node.operator) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return left / right;
        case '%': return left % right;
        case '==': return left == right;
        case '!=': return left != right;
        case '===': return left === right;
        case '!==': return left !== right;
        case '<': return left < right;
        case '<=': return left <= right;
        case '>': return left > right;
        case '>=': return left >= right;
        default: throw new SyntaxError(`Unsupported operator "${node.operator}".`);
      }
    }
    default:
      throw new SyntaxError('Unsupported expression.');
  }
}

function evaluateLibraryExpression(source, library, Temporal, bindings = {}) {
  const ast = new Parser(tokenize(source)).parse();
  const scope = Object.create(null);
  for (const name of Object.keys(library)) {
    if (identifier.test(name) && !forbiddenProperties.has(name)) scope[name] = library[name];
  }
  scope.lib = library;
  scope.Temporal = Temporal;
  for (const [name, value] of Object.entries(bindings)) {
    if (!identifier.test(name) || forbiddenProperties.has(name)) throw new TypeError(`Invalid binding name "${name}".`);
    scope[name] = value;
  }
  return evaluate(ast, scope);
}

globalThis.TemporalFmtTerminal = Object.freeze({ evaluateLibraryExpression });
})();
