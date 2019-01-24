
class RockyHashTree {
  constructor(chars, depth) {
    if (!RockyHashTree.HashMap) {
      RockyHashTree.HashMap = {};
      for (let i = 0; i < RockyHashTree.HashChars.length; i++) {
        RockyHashTree.HashMap[RockyHashTree.HashChars[i]] = i;
      }
    }

    let bytes = (chars.length) / 8;
    if (~~bytes !== bytes) {
      bytes = ~~bytes + 1;
    }
    this.entrySize = bytes;
    this.treeSize = (this.entrySize * chars.length);

    depth = depth || 192;
    this.depth = depth;
    this.chars = chars;
    this.treeCreationTime = Date.now();

    this.commits = 0;
    this.maxCommits = 24 << 8;

    const size = this.treeSize * depth;
    const hashSize = (2 * 16) * 32;

    this.buffer = Buffer.alloc(size + (hashSize * (RockyHashTree.HASHTREES + 1)));
    // this.reverseBuffer = Buffer.alloc(this.treeSize * depth);

    this.fd = fs.openSync('./' + (Math.random() * 1000000).toString(16) + '.rht', 'w+');
    this.branch = 0;
    this.charMap = {};

    for (let i = 0; i < this.chars.length; i++) {
      this.charMap[chars[i]] = i;
    }
  }

  get offset() {
    const size = this.treeSize * this.depth;
    const hashSize = (2 * 16) * 32;
    const len = size + (hashSize * (RockyHashTree.HASHTREES + 1));

    return len;
  }

  read(branch) {
    const buf = Buffer.alloc(this.offset);

    fs.readSync(this.fd, buf, 0, buf.length, branch * this.offset);

    return buf;
  }

  write(branch) {
    fs.writeSync(this.fd, this.buffer, 0, this.buffer.length, branch * this.offset);

    return true;
  }

  _getBit(buf, depth, prevChar, char) {
    const pos = (this.treeSize * depth) + (this.entrySize * this.charMap[prevChar]);
    let index = this.charMap[char];
    const byteIndex = ~~(index / 8);

    index = (index % 8);

    return (buf[pos + byteIndex] >> index) & 1;
  }

  _setBit(buf, depth, prevChar, char) {
    const pos = (this.treeSize * depth) + (this.entrySize * this.charMap[prevChar]);
    let index = this.charMap[char];
    const byteIndex = ~~(index / 8);

    index = (index % 8);

    const val = buf[pos + byteIndex] | (1 << index);

    buf[pos + byteIndex] = val;
  }

  _getReverseBit(depth, prevChar, char) {
    const pos = (this.treeSize * depth) + (this.entrySize * this.charMap[prevChar]);
    let index = this.charMap[char];
    const byteIndex = ~~(index / 8);

    index = (index % 8);

    return (this.reverseBuffer[pos + byteIndex] >> index) & 1;
  }

  _setReverseBit(depth, prevChar, char) {
    const pos = (this.treeSize * depth) + (this.entrySize * this.charMap[prevChar]);
    let index = this.charMap[char];
    const byteIndex = ~~(index / 8);

    index = (index % 8);

    const val = this.reverseBuffer[pos + byteIndex] | (1 << index);

    this.reverseBuffer[pos + byteIndex] = val;
  }

  _createHash(str) {
    RockyHashTree.HashBuf.fill(0);

    let hash = 92821;
    const len = str.length;
    const x = 16;

    for (let i = len - 1; i > 0; i--) {
      let l = str.charCodeAt(i);
      let f = str.charCodeAt((len - 1) - i);
      const c = (l | f >> 8) * hash;

      l += f + c >> 16;
      f += l + c >> 8;
      hash ^= l;
      RockyHashTree.HashBuf[x - (x % i)] = l;
      hash *= f;
      RockyHashTree.HashBuf[i % x] = f;
    }

    return RockyHashTree.HashBuf.toString('hex');
  }

  _commit(str, buf) {
    const len = str.length;
    let depth = 0;

    for (let i = 1; i < len; i++) {
      //anchor
      this._setBit(buf, depth, str[i - 1], str[i]);

      //back-reference
      //this._setReverseBit(depth+1, str[i], str[i - 1]);
      depth++;
      //this._setBit(depth, str[i]);
    }
    return true;
  }

  _getHashTree(hash) {
    if (RockyHashTree.HASHTREES === 0xff) {
      return parseInt(hash[1], 16)
        | (parseInt(hash[hash.length - 2], 16) << 4);
    }

    if (RockyHashTree.HASHTREES === 0xfff) {
      return parseInt(hash[24], 16)
        | parseInt(hash[26], 16) << 4
        | (parseInt(hash[29], 16) << 8);
    }

    //if (RockyHashTree.HASHTREES === 0xfff) {
    //  return parseInt(hash[1], 16)
    //    | (parseInt(hash[hash.length - 4], 16) << 4)
    //    | (parseInt(hash[hash.length - 2], 16) << 8);
    //}

    if (RockyHashTree.HASHTREES === 0xffff) {
      return parseInt(hash[0], 16)
        | (parseInt(hash[1], 16) << 4)
        | (parseInt(hash[hash.length - 2], 16) << 8)
        | (parseInt(hash[hash.length - 1], 16) << 12);
    }
  }

  commitHash(hash, buf) {
    const tree = this._getHashTree(hash);
    const len = hash.length;
    let depth = 0;
    //hashSize = (2 * 16) * 32;
    const bufferStartPos = (this.treeSize * this.depth) + (2 * 16 * 32 * tree);

    for (let i = 1; i < len; i++) {
      //anchor
      const pos = bufferStartPos + (32 * depth) + (2 * RockyHashTree.HashMap[hash[i - 1]]);
      let index = RockyHashTree.HashMap[hash[i]];
      const byteIndex = ~~(index / 8);
      index = (index % 8);

      const val = buf[pos + byteIndex] | (1 << index);
      buf[pos + byteIndex] = val;
      depth++;
    }
  }

  lookupHash(str, buf) {
    const hash = this._createHash(str);
    const tree = this._getHashTree(hash, str.length - 1);
    const len = hash.length;
    let depth = 0;
    //hashSize = (2 * 16) * 32;
    const bufferStartPos = (this.treeSize * this.depth) + (2 * 16 * 32 * tree);

    for (let i = 1; i < len; i++) {
      //anchor
      const pos = bufferStartPos + (32 * depth) + (2 * RockyHashTree.HashMap[hash[i - 1]]);
      let index = RockyHashTree.HashMap[hash[i]];
      const byteIndex = ~~(index / 8);

      index = (index % 8);

      if (!((buf[pos + byteIndex] >> index) & 1)) {
        return false;
      }

      depth++;
    }

    return true;
  }

  commit(key, value) {
    this.commits++;

    if (this.commits % this.maxCommits === 0) {
      this.write(this.branch);
      this.branch++;
      this.buffer.fill(0);
    }

    const str = key + value + RockyHashTree.END_MARKER;
    const len = str.length;

    for (let i = key.length; i < len; i++) {
      const h = str.substring(0, i + 1);
      const hash = this._createHash(h);

      this.commitHash(hash, this.buffer);
    }

    return this._commit(str, this.buffer);
  }

  _lookup(str, buf) {
    const len = str.length;
    let depth = 0;

    for (let i = 1; i < len; i++) {
      //self-bit,anchor
      if (!this._getBit(buf, depth, str[i - 1], str[i])) {
        return null;
      }

      //if (!this._getReverseBit(depth+1, str[i], str[i - 1])) {
        //console.log('backref fail', str, str[i], str[i-1]);
      //  return null;
      //}
      depth++;

      if (depth === len - 1) {
        const res = [[depth, this.charMap[str[i]], '']];

        res.bufferRef = buf;

        return res;
      }
    }

    return null;
  }

  lookup(str, callback, scope, state, branch) {
    if (!state) {
      if (branch == null) {
        branch = this.branch;
      }

      const buf = branch === this.branch ? this.buffer : this.read(branch);

      state = this._lookup(str, buf);
      if (!state) {
        const next = branch - 1;

        if (next >= 0) {
          const self = this;

          process.nextTick(function() {
            self.lookup(str, callback, scope, null, next);
          });
          return;
        }
        callback.call(scope, [], true);
        return;
      }
    }

    const results = [];
    const obj = state.pop();
    const depth = obj[0];
    const entryIndex = obj[1];
    const val = obj[2];

    const len = this.chars.length;
    for (let i = 0; i < len; i++) {
      if (this._getBit(state.bufferRef, depth, this.chars[entryIndex], this.chars[i]) === 0) {
        continue;
      }

      //if (this._getReverseBit(depth+1, this.chars[i], this.chars[entryIndex], true) === 0) {
      //console.log('backref fail', val+this.chars[i]);
      //  continue;
      //}

      const x = val + this.chars[i];
      if (this.lookupHash(str + x, state.bufferRef)) {
        if (x.endsWith(RockyHashTree.END_MARKER)) {
          results.push(x.substring(0, x.length - RockyHashTree.END_MARKER.length));
          continue;
        }
        state.push([depth + 1, i, x]);
        continue;
      }
    }

    if (results.length > 0 || state.length === 0) {
      const next = branch - 1;
      const self = this;

      process.nextTick(function() {
        if (callback.call(scope, results, state.length === 0 && next < 0)) {
          return;
        }

        if (state.length === 0 && next >= 0) {
          self.lookup(str, callback, scope, null, next);
        }
      });
    }

    if (state.length !== 0) {
      const self = this;

      process.nextTick(function() {
        self.lookup.call(self, str, callback, scope, state, branch);
      });
    }
  }
}
RockyHashTree.END_MARKER = '921925432';
RockyHashTree.HASHTREES = 0xff;
RockyHashTree.HashBuf = Buffer.alloc(16);
RockyHashTree.HashMap = null;
RockyHashTree.HashChars = '0123456789abcdef';

this.RockyHashTree = RockyHashTree;
