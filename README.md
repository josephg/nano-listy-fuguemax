# Nano List based FugueMax

[**Play with it online**](https://josephg.github.io/nano-listy-fuguemax/)

This is a tiny reference implementation of the current best-in-class list / text based CRDT: [FugueMax](https://github.com/mweidner037/fugue) / YjsMod. FugueMax is fast, correct and guarantees non-interleaving.

FugueMax is described in this paper: [The Art of the Fugue: Minimizing Interleaving in Collaborative Text Editing](https://arxiv.org/abs/2305.00583).

The paper defines FugueMax as if it maintains & modifies a tree of items. But it turns out its very hard to efficiently implement CRDTs which use trees internally, as the trees get super unbalanced and operations descend to O(n) runtime behaviour. What you really want is a list-based implementation, like Yjs does. This allows the items themselves to be stored in an array - or, even better, a B-Tree.

FugueMax itself (in the paper) is a combination of Fugue and my YjsMod algorithm from [josephg/reference-crdts](https://github.com/josephg/reference-crdts). This implementation predates the fugue paper by a few years. FugueMax and YjsMod look like very different algorithms on paper, but as far as I can tell, they're isomorphic. (I haven't mathematically proven it, but according to my fuzzer, all interleavings of random edits generate the same resulting document state. I consider that to be pretty conclusive.)


## Whats in the box

This library contains 3 things:

1. **[crdt.ts](crdt.ts)**: This file contains the FugueMax / YjsMod list CRDT implementation. Note this implementation is written for educational purposes. It has no optimisations, and its missing the ability to save and load the CRDT to and from disk. And its missing the ability to sync the CRDT over the network - which is generally a nice thing to be able to do. This file is hopefully easy to read. Its less than 300 lines of code.
2. **[editor.ts](editor.ts) & [index.html](index.html)**: These files contain a working web based text editor which can sync changes between two editors. Again, treat this as a reference implementation. This implementation is vanilla JS to make it easy as possible to understand and play with.
3. **[test.ts](test.ts)**: A series of unit tests and a fuzzer for the CRDT implementation. If you ever see a collaborative editor with no fuzzer, run for the hills.


# LICENSE

Shared under the ISC license:

Copyright 2021 Joseph Gentle

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
