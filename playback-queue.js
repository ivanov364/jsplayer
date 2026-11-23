class QueueNode {
  constructor(data) {
    this.data = data
    this.next = null
  }
}

class Queue {
  constructor() {
    this.head = null
    this.tail = null
    this.size = 0
  }

  enqueue(data) {
    const node = new QueueNode(data)
    if (this.tail === null) {
      this.head = node
      this.tail = node
    } else {
      this.tail.next = node
      this.tail = node
    }
    this.size += 1
  }

  prepend(data) {
    const node = new QueueNode(data)
    if (this.head === null) {
      this.head = node
      this.tail = node
    } else {
      node.next = this.head
      this.head = node
    }
    this.size += 1
  }

  dequeue() {
    if (this.head === null) return null

    const node = this.head
    this.head = node.next
    if (this.head === null) this.tail = null
    this.size -= 1
    return node.data
  }

  clear() {
    this.head = null
    this.tail = null
    this.size = 0
  }

  *entries() {
    let node = this.head
    while (node !== null) {
      yield node.data
      node = node.next
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Queue
}

if (typeof window !== 'undefined') {
  window.Queue = Queue
}
