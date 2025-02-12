// This file implements a super simple text editor using textarea on top of the
// CRDT implementation.

import { CRDTDocument, Id, Item } from "./crdt.js"

type DiffResult = {pos: number, del: number, ins: string}

// This is a very simple diff function. Notably it doesn't take into account
// the user's cursor position - so as you type "aaaaa", we can't tell which
// "a" you've just inserted each time.
const calcDiff = (oldval: string, newval: string): DiffResult => {
  // Strings are immutable and have reference equality. I think this test is O(1), so its worth doing.
  if (oldval === newval) return {pos: 0, del: 0, ins: ''}

  let oldChars = [...oldval]
  let newChars = [...newval]

  var commonStart = 0;
  while (oldChars[commonStart] === newChars[commonStart]) {
    commonStart++;
  }

  var commonEnd = 0;
  while (oldChars[oldChars.length - 1 - commonEnd] === newChars[newChars.length - 1 - commonEnd] &&
      commonEnd + commonStart < oldChars.length && commonEnd + commonStart < newChars.length) {
    commonEnd++;
  }

  const del = (oldChars.length !== commonStart + commonEnd)
    ? oldChars.length - commonStart - commonEnd
    : 0
  const ins = (newChars.length !== commonStart + commonEnd)
    ? newChars.slice(commonStart, newChars.length - commonEnd).join('')
    : ''

  return {
    pos: commonStart, del, ins
  }
}

const elemById = (name: string): HTMLElement => {
  const elem = document.getElementById(name)
  if (elem == null) throw Error('Missing element ' + name)
  return elem
}

const idToStr = ([agent, seq]: Id) => `${agent}-${seq}`

const attachEditor = (agentName: string, textareaId: string, mirrorId: string, infoElem: HTMLDivElement) => {
  const textareaElem = elemById(textareaId) as HTMLTextAreaElement
  const mirrorElem = elemById(mirrorId) as HTMLDivElement

  const doc = new CRDTDocument(agentName)
  let lastValue = doc.getString()
  textareaElem.value = lastValue

  let otherDoc: CRDTDocument | null = null

  // When the text changes, we also need to update the mirror's content.
  function updateMirrorContent() {
    // This is pretty inefficient but for this demo its fine. I'll remove all
    // children and then add back everything in the document.
    while (mirrorElem.firstChild) {
      mirrorElem.removeChild(mirrorElem.firstChild)
    }

    for (let i = 0; i < doc.inner.content.length; i++) {
      const item = doc.inner.content[i]
      if (!item.isDeleted) {
        const child = document.createElement('span')
        child.setAttribute('data-crdt-id', idToStr(item.id))
        child.setAttribute('data-idx', `${i}`)
        if (otherDoc && !otherDoc.has(item.id)) {
          child.setAttribute('data-new', 'true')
        }
        child.textContent = item.content
        mirrorElem.appendChild(child)
      }
    }

    // And one at the end standing in for the end of the document
    const child = document.createElement('span')
    child.setAttribute('data-crdt-id', 'end')
    child.textContent = ' '
    mirrorElem.appendChild(child)
  }

  updateMirrorContent()

  let lastHighlightedElems: Element[] = []
  textareaElem.onmousemove = (e: MouseEvent) => {
    for (const _elem of document.elementsFromPoint(e.clientX, e.clientY)) {
      // elementsFromPoint will return the textarea, and everything behind it
      // - including the span (what we want), the div, the body and so on.
      if (_elem.tagName === 'SPAN') {
        for (const e of lastHighlightedElems) {
          e.removeAttribute('class')
        }

        const elem = _elem as HTMLElement
        // elem.setAttribute('class', 'hovered')

        lastHighlightedElems.length = 0
        // lastHighlightedElems.push(elem)

        const idxStr = elem.dataset.idx

        // The placeholder end element looks like this. Ignore it.
        if (idxStr == null) break

        const idx = parseInt(idxStr)
        const item = doc.inner.content[idx]
        if (item == null) {
          console.warn('out of sync - could not find item. bleh')
          console.log(elem)
          break;
        }

        infoElem.innerText = JSON.stringify(item, null, 2)

        // Highlight the item, the left origin and right origin. I'm doing this with
        // querySelectorAll so we tag the items in both text areas.
        for (const e of document.querySelectorAll(`[data-crdt-id=${idToStr(item.id)}]`)) {
          e.setAttribute('class', 'hovered')
          lastHighlightedElems.push(e)
        }
        if (item.originLeft) {
          for (const e of document.querySelectorAll(`[data-crdt-id=${idToStr(item.originLeft)}]`)) {
            e.setAttribute('class', 'leftOrigin')
            lastHighlightedElems.push(e)
          }
        }
        for (const e of document.querySelectorAll(`[data-crdt-id=${item.originRight ? idToStr(item.originRight): 'end'}]`)) {
          e.setAttribute('class', 'rightOrigin')
          lastHighlightedElems.push(e)
        }
        break
      }
    }
  }
  // textareaElem.onmouseenter = (e: MouseEvent) => {
  //   console.log('mouse enter', e.target)
  //   console.log(document.elementsFromPoint(e.clientX, e.clientY))
  // }


  ;['textInput', 'keydown', 'keyup', 'select', 'cut', 'paste', 'input'].forEach(eventName => {
    textareaElem.addEventListener(eventName, e => {
      setTimeout(() => {
        let newValue = textareaElem.value
        // Fix for windows - replace \r\n with just \n.
        newValue = newValue.replace(/\r\n/g, '\n')
        if (newValue !== lastValue) {
          let { pos, del, ins } = calcDiff(lastValue, newValue)

          if (del > 0) doc.del(pos, del)
          if (ins !== '') doc.ins(pos, [...ins])

          if (doc.getString() != newValue) throw Error('Diff invalid - document does not match')

          lastValue = newValue
          updateMirrorContent()

          console.log(doc.inner)
        }
      }, 0)
    }, false)
  })

  return {
    doc,
    updateMirror() {
      updateMirrorContent()
    },
    reset() {
      doc.reset()
      textareaElem.value = lastValue = doc.getString()
      updateMirrorContent()
    },
    mergeFrom(other: CRDTDocument) {
      doc.mergeFrom(other)
      textareaElem.value = lastValue = doc.getString()
      updateMirrorContent()
    },
    setOther(doc: CRDTDocument) {
      otherDoc = doc
      updateMirrorContent()
    }
  }
}

window.onload = () => {
  const infoElem = elemById('iteminfo') as HTMLDivElement
  const a = attachEditor('a', 'text1', 'mirror1', infoElem)
  const b = attachEditor('b', 'text2', 'mirror2', infoElem)

  a.setOther(b.doc)
  b.setOther(a.doc)

  elemById('reset').onclick = () => {
    console.log('reset')
    a.reset()
    b.reset()
    infoElem.innerText = ''
  }

  elemById('pushLeft').onclick = () => {
    a.mergeFrom(b.doc)
    b.updateMirror()
  }
  elemById('pushRight').onclick = () => {
    b.mergeFrom(a.doc)
    a.updateMirror()
  }

  console.log('OK!')
}
