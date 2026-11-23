class DLLNode {
  constructor(data) {
    this.data = data
    this.next = null
    this.previous = null
  }
}

class DLL {
  constructor() {
    this._head = null
    this._tail = null
    this._size = 0
  }

  append(data) {
    const node = new DLLNode(data)

    if (this._tail === null) {
      this._head = node
      this._tail = node
    } else {
      node.previous = this._tail
      this._tail.next = node
      this._tail = node
    }

    this._size += 1
    return node
  }

  prepend(data) {
    const node = new DLLNode(data)

    if (this._head === null) {
      this._head = node
      this._tail = node
    } else {
      node.next = this._head
      this._head.previous = node
      this._head = node
    }

    this._size += 1
    return node
  }

  clear() {
    this._head = null
    this._tail = null
    this._size = 0
  }

  get size() {
    return this._size
  }

  getNodeAt(position) {
    if (!Number.isInteger(position) || position < 0 || position >= this._size) {
      throw new RangeError('Invalid position.')
    }

    let node
    if (position < this._size / 2) {
      node = this._head
      for (let index = 0; index < position; index += 1) node = node.next
    } else {
      
      node = this._tail
      for (let index = this._size - 1; index > position; index -= 1) node = node.previous
    }
    return node
  }

  removeAt(position) {
    const node = this.getNodeAt(position)

    if (node.previous) node.previous.next = node.next
    else this._head = node.next

    if (node.next) node.next.previous = node.previous
    else this._tail = node.previous

    node.next = null
    node.previous = null
    this._size -= 1
    return node.data
  }

  moveAt(fromPosition, toPosition) {
    if (!Number.isInteger(fromPosition) || !Number.isInteger(toPosition) ||
      fromPosition < 0 || fromPosition >= this._size ||
      toPosition < 0 || toPosition >= this._size) {
      throw new RangeError('Invalid position.')
    }
    if (fromPosition === toPosition) return this.getNodeAt(fromPosition)

    const node = this.getNodeAt(fromPosition)

    if (node.previous) node.previous.next = node.next
    else this._head = node.next
    if (node.next) node.next.previous = node.previous
    else this._tail = node.previous
    this._size -= 1

    node.next = null
    node.previous = null

    if (toPosition === 0) {
      node.next = this._head
      this._head.previous = node
      this._head = node
    } else if (toPosition >= this._size) {
      node.previous = this._tail
      this._tail.next = node
      this._tail = node
    } else {
      const nextNode = this.getNodeAt(toPosition)
      node.previous = nextNode.previous
      node.next = nextNode
      nextNode.previous.next = node
      nextNode.previous = node
    }

    this._size += 1
    return node
  }

  *nodes() {
    let node = this._head
    for (let index = 0; index < this._size; index += 1) {
      yield node
      node = node.next
    }
  }

  quickSort(compare = (left, right) => String(left).localeCompare(String(right))) {
    const swapData = (leftIndex, rightIndex) => {
      if (leftIndex === rightIndex) return
      const leftNode = this.getNodeAt(leftIndex)
      const rightNode = this.getNodeAt(rightIndex)
      const temporaryData = leftNode.data
      leftNode.data = rightNode.data
      rightNode.data = temporaryData
    }

    const partition = (low, high) => {
      const pivot = this.getNodeAt(high).data
      let smallerIndex = low

      for (let index = low; index < high; index += 1) {
        if (compare(this.getNodeAt(index).data, pivot) <= 0) {
          swapData(smallerIndex, index)
          smallerIndex += 1
        }
      }

      swapData(smallerIndex, high)
      return smallerIndex
    }

    const sort = (low, high) => {
      if (low >= high) return
      const pivotIndex = partition(low, high)
      sort(low, pivotIndex - 1)
      sort(pivotIndex + 1, high)
    }

    sort(0, this._size - 1)
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DLL
}

if (typeof window !== 'undefined') {
  window.DLL = DLL
}
