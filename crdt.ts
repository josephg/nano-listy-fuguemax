// This file contains a simple implementation of YjsMod - aka FugueMax.
//
// The reference fuguemax implementation is here:
// https://github.com/mweidner037/fugue
//
// ... But this implementation stores the document as a list instead of a tree,
// which is (in my opinion) how you actually want to implement algorithms
// like this.

function assert(expr: boolean, msg?: string): asserts expr {
  if (!expr) throw Error(msg != null ? `Assertion failed: ${msg}` : 'Assertion failed')
}

// Every inserted item has a unique ID, made up of an (agent, sequence number)
// tuple.
//
// You could use GUIDs instead, but (agent, seq) pairs are usually used instead
// because they compress better.
export type Id = [agent: string, seq: number]

// The document stores a vector clock version as a map from agent -> last seen
// sequence number for that agent.
export type Version = Record<string, number>

// The document is actually a list of "Items". Each item stores some content,
// and extra CRDT related flags.
//
// Deleted items are simply marked as deleted.
export type Item<T> = {
  content: T,

  id: Id,
  originLeft: Id | null, // Null = the start of the document
  originRight: Id | null, // Null = the end of the document.

  isDeleted: boolean,
}

// A document is a list of items.
export interface Doc<T = string> {
  content: Item<T>[] // Could take Item as a type parameter, but eh. This is better for demos.

  version: Version // agent => last seen seq.
  length: number // Cached number of items not deleted. This isn't needed.
}

export const newDoc = <T>(): Doc<T> => ({
  content: [],
  version: {},
  length: 0,
})

const idEq = (a: Id | null, b: Id | null): boolean => (
  a == b || (a != null && b != null && a[0] === b[0] && a[1] === b[1])
)


// Find the index of the item in the document with the specified ID. This
// function has linear time. In optimised implementations, this should ideally
// be done in log(n) time on average. Scanning is slow.
const findItemAtId = <T>(doc: Doc<T>, needle: Id | null): number | null => {
  if (needle == null) return null

  for (let i = 0; i < doc.content.length; i++) {
    if (idEq(needle, doc.content[i].id)) return i
  }
  throw Error('Could not find item')
}

// Find the index of the item at the specified content position in the document.
const findItemAtPos = <T>(doc: Doc<T>, pos: number, stick_end: boolean = false): number => {
  let i = 0
  // console.log('pos', pos, doc.length, doc.content.length)
  for (; i < doc.content.length; i++) {
    const item = doc.content[i]
    if (stick_end && pos === 0) return i
    else if (item.isDeleted) continue
    else if (pos === 0) return i

    pos--
  }

  if (pos === 0) return i
  else throw Error('past end of the document')
}

// Insert an item into the document from a local editor.
export function localInsert<T>(doc: Doc<T>, agent: string, pos: number, content: T) {
  let i = findItemAtPos(doc, pos)
  integrate(doc, {
    content,
    id: [agent, (doc.version[agent] ?? -1) + 1],
    isDeleted: false,
    originLeft: doc.content[i - 1]?.id ?? null,
    originRight: doc.content[i]?.id ?? null, // Only for yjs, yjsmod
  }, i)
}

// Insert an item into the document from a remote editor
export function remoteInsert<T>(doc: Doc<T>, item: Item<T>) {
  integrate(doc, item)
}

export const localDelete = <T>(doc: Doc<T>, agent: string, pos: number, delLen: number = 1) => {
  // Note - this is an unusual for loop!
  for (let idx = findItemAtPos(doc, pos); delLen > 0; idx++) {
    const item = doc.content[idx]
    if (!item.isDeleted) {
      delLen--
      item.isDeleted = true
      doc.length -= 1
    }
  }
}

// This function takes a new item, and finds the appropriate location to insert
// the item into the document.
//
// You can think of this function as the "kernel" of the FugueMax / YjsMod CRDT.
function integrate<T>(doc: Doc<T>, newItem: Item<T>, idx_hint: number = -1) {
  const lastSeen = doc.version[newItem.id[0]] ?? -1
  if (newItem.id[1] !== lastSeen + 1) throw Error('Operations out of order')

  // Mark the item in the document version.
  doc.version[newItem.id[0]] = newItem.id[1]

  // If originLeft is null, that means it was inserted at the start of the document.
  // We'll pretend there was some item at position -1 which we were inserted to the
  // right of.
  let left = findItemAtId(doc, newItem.originLeft) ?? -1
  let destIdx = left + 1
  let right = newItem.originRight == null ? doc.content.length : findItemAtId(doc, newItem.originRight)!
  let scanning = false

  // This loop scans forward from destIdx until it finds the right place to insert into
  // the list.
  for (let i = destIdx; ; i++) {
    if (!scanning) destIdx = i
    // If we reach the end of the document, just insert.
    if (i === doc.content.length) break
    if (i === right) break // No ambiguity / concurrency. Insert here.

    let other = doc.content[i]

    let oleft = findItemAtId(doc, other.originLeft) ?? -1
    let oright = other.originRight == null ? doc.content.length : findItemAtId(doc, other.originRight)!

    // The logic below summarizes to:
    if (oleft < left || (oleft === left && oright === right && newItem.id[0] < other.id[0])) break
    if (oleft === left) scanning = oright < right

    // This is the same code as the above 2 lines, but written out the long way:
    // if (oleft < left) {
    //   // Top row. Insert, insert, arbitrary (insert)
    //   break
    // } else if (oleft === left) {
    //   // Middle row.
    //   if (oright < right) {
    //     // This is tricky. We're looking at an item we *might* insert after - but we can't tell yet!
    //     scanning = true
    //     continue
    //   } else if (oright === right) {
    //     // Raw conflict. Order based on user agents.
    //     if (newItem.id[0] < other.id[0]) break
    //     else {
    //       scanning = false
    //       continue
    //     }
    //   } else { // oright > right
    //     scanning = false
    //     continue
    //   }
    // } else { // oleft > left
    //   // Bottom row. Arbitrary (skip), skip, skip
    //   continue
    // }
  }

  // We've found the position. Insert here.
  doc.content.splice(destIdx, 0, newItem)
  if (!newItem.isDeleted) doc.length += 1
}

export const getArray = <T>(doc: Doc<T>): T[] => (
  doc.content.filter(i => !i.isDeleted).map(i => i.content)
)

export const getDocContent = (doc: Doc<string>): string => (
  getArray(doc).join('')
)


// This is a very simplistic merging approach. Items must - in many cases - be
// added in the order they were inserted in the first place.

export const isInVersion = (id: Id | null, version: Version) => {
  if (id == null) return true
  const seq = version[id[0]]
  return seq != null && seq >= id[1]
}

export const canInsertNow = <T>(op: Item<T>, doc: Doc<T>): boolean => (
  // We need op.id to not be in doc.versions, but originLeft and originRight to be in.
  // We're also inserting each item from each agent in sequence.
  !isInVersion(op.id, doc.version)
    && (op.id[1] === 0 || isInVersion([op.id[0], op.id[1] - 1], doc.version))
    && isInVersion(op.originLeft, doc.version)
    && isInVersion(op.originRight, doc.version)
)

// Merge all missing items from src into dest.
export const merge = <T>(dest: Doc<T>, src: Doc<T>) => {
  // The list of operations we need to integrate
  const missing: (Item<T> | null)[] = src.content.filter(op => op.content != null && !isInVersion(op.id, dest.version))
  let remaining = missing.length

  while (remaining > 0) {
    // Find the next item in remaining and insert it.
    let mergedOnThisPass = 0

    for (let i = 0; i < missing.length; i++) {
      const op = missing[i]
      if (op == null || !canInsertNow(op, dest)) continue
      integrate(dest, op)
      missing[i] = null
      remaining--
      mergedOnThisPass++
    }

    assert(mergedOnThisPass > 0)
  }

  // Ok, now we need to merge all deletes. Deleted items are just marked as
  // deleted=true. An item should be marked deleted if its deleted in either
  // document.
  //
  // We'll walk both documents together (since they're in the same order),
  // copying deleted flags from src to dest.
  let srcIdx = 0, destIdx = 0
  while (srcIdx < src.content.length) {
    // The dest item may contain items missing in src. Skip over them.
    let srcItem = src.content[srcIdx]
    let destItem = dest.content[destIdx]

    while (!idEq(srcItem.id, destItem.id)) {
      // Skip.
      destIdx++
      assert(destIdx < dest.content.length, "src item missing in dest!")
      destItem = dest.content[destIdx] // If this overflows, we have invalid state.
    }

    if (srcItem.isDeleted) {
      dest.content[destIdx].isDeleted = true
    }

    srcIdx++
    destIdx++
  }
}

// Simple class wrapper for the document functions listed above.
export class CRDTDocument<T = string> {
  inner: Doc<T>
  agent: string

  // The agent should be a globally unique string.
  constructor(agent: string) {
    this.inner = newDoc()
    this.agent = agent
  }

  // ins(pos: number, content: T) {
  //   localInsert(this.inner, this.agent, pos, content)
  // }
  ins(pos: number, content: T[]) {
    for (const i of content) {
      localInsert(this.inner, this.agent, pos, i)
      pos++
    }
  }

  del(pos: number, len: number) {
    localDelete(this.inner, this.agent, pos, len)
  }

  getString(): string {
    return getArray(this.inner).join('')
  }

  reset() {
    this.inner = newDoc()
  }

  mergeFrom(other: CRDTDocument<T>) {
    merge(this.inner, other.inner)
  }
}
