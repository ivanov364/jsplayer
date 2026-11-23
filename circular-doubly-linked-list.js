(() => {
const BaseDLL = typeof window !== 'undefined'
  ? window.DLL
  : require('./doubly-linked-list')

class CircularDLL extends BaseDLL {
  append(data) {
    const newNode = {
      data,
      next: null,
      previous: null
    }

    if (this._head === null) {
      newNode.next = newNode
      newNode.previous = newNode
      this._head = newNode
      this._tail = newNode
    } else {
      newNode.previous = this._tail
      newNode.next = this._head
      this._tail.next = newNode
      this._head.previous = newNode
      this._tail = newNode
    }

    this._size += 1
    return newNode
  }

  prepend(data) {
    const newHead = this.append(data)
    if (this._size === 1) return newHead

    this._tail = newHead.previous
    this._head = newHead
    return newHead
  }

  insert(data, position) {
    if (!Number.isInteger(position) || position < 0 || position > this._size) {
      throw new RangeError('Invalid position.')
    }
    if (position === this._size) return this.append(data)
    if (position === 0) return this.prepend(data)

    const nextNode = this.getNodeAt(position)
    const newNode = { data, next: nextNode, previous: nextNode.previous }
    nextNode.previous.next = newNode
    nextNode.previous = newNode
    this._size += 1
    return newNode
  }

  removeAt(position) {
    const removedNode = this.getNodeAt(position)

    if (this._size === 1) {
      this.clear()
    } else {
      removedNode.previous.next = removedNode.next
      removedNode.next.previous = removedNode.previous
      if (removedNode === this._head) this._head = removedNode.next
      if (removedNode === this._tail) this._tail = removedNode.previous
      this._size -= 1
    }

    removedNode.next = null
    removedNode.previous = null
    return removedNode.data
  }

  moveAt(fromPosition, toPosition) {
    if (!Number.isInteger(fromPosition) || !Number.isInteger(toPosition) || fromPosition < 0 || fromPosition >= this._size || toPosition < 0 || toPosition >= this._size) {
      throw new RangeError('Invalid position.')
    }
    
    if (fromPosition === toPosition) return this.getNodeAt(fromPosition)

    const movedNode = this.getNodeAt(fromPosition)
    movedNode.previous.next = movedNode.next
    movedNode.next.previous = movedNode.previous
    if (movedNode === this._head) this._head = movedNode.next
    if (movedNode === this._tail) this._tail = movedNode.previous
    this._size -= 1

    if (toPosition === 0) {
      movedNode.previous = this._tail
      movedNode.next = this._head
      this._tail.next = movedNode
      this._head.previous = movedNode
      this._head = movedNode
    } else if (toPosition >= this._size) {
      movedNode.previous = this._tail
      movedNode.next = this._head
      this._tail.next = movedNode
      this._head.previous = movedNode
      this._tail = movedNode
    } else {
      const nextNode = this.getNodeAt(toPosition)
      movedNode.previous = nextNode.previous
      movedNode.next = nextNode
      nextNode.previous.next = movedNode
      nextNode.previous = movedNode
    }

    this._size += 1
    return movedNode
  }

  reverse() {
    let currentNode = this._head
    for (let index = 0; index < this._size; index += 1) {
      const nextNode = currentNode.next
      currentNode.next = currentNode.previous
      currentNode.previous = nextNode
      currentNode = nextNode
    }
    const oldHead = this._head
    this._head = this._tail
    this._tail = oldHead
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CircularDLL
}

if (typeof window !== 'undefined') {
  window.CircularDLL = CircularDLL
}
})()
