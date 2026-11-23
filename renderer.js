const player = document.getElementById('player')
const songList = document.getElementById('songList')
const nowPlaying = document.getElementById('nowPlaying')
const status = document.getElementById('status')
const songCount = document.getElementById('songCount')
const queueCount = document.getElementById('queueCount')
const playbackQueueList = document.getElementById('playbackQueueList')
const previousTrackButton = document.getElementById('previousTrackBtn')
const nextTrackButton = document.getElementById('nextTrackBtn')
const trackArt = document.querySelector('.track-art')
const trackNumber = document.querySelector('.track-number')
const selectedAlbumStatus = document.getElementById('selectedAlbumStatus')
const audioFileInput = document.getElementById('audioFileInput')
const audioFolderInput = document.getElementById('audioFolderInput')
const supportedAudioExtensions = new Set(['mp3', 'flac'])

const createBrowserSong = (file) => {
  const fileName = file.name.replace(/\.[^.]+$/, '')
  const parts = fileName.split(/\s+[–—-]\s+/)
  const hasStructuredName = parts.length >= 4 && /^\d+$/.test(parts[2])
  const pathParts = file.webkitRelativePath.split('/').filter(Boolean)

  return {
    url: URL.createObjectURL(file),
    title: hasStructuredName ? parts.slice(3).join(' – ') : fileName,
    artist: hasStructuredName ? parts[0] : 'Unknown artist',
    album: hasStructuredName ? parts[1] : (pathParts.at(-2) || 'Unknown album'),
    trackNumber: hasStructuredName ? Number(parts[2]) : Number.MAX_SAFE_INTEGER,
    sourceFolderPath: pathParts.length > 1 ? pathParts[0] : undefined
  }
}

const selectBrowserAudio = (mode) => new Promise((resolve) => {
  const input = mode === 'folder' ? audioFolderInput : audioFileInput
  const finishSelection = (selectedSongs) => {
    input.removeEventListener('change', handleChange)
    input.removeEventListener('cancel', handleCancel)
    resolve(selectedSongs)
  }
  const handleChange = () => {
    const selectedSongs = [...input.files]
      .filter((file) => supportedAudioExtensions.has(file.name.split('.').pop().toLowerCase()))
      .map(createBrowserSong)
    finishSelection(selectedSongs)
  }
  const handleCancel = () => finishSelection([])

  input.value = ''
  input.addEventListener('change', handleChange, { once: true })
  input.addEventListener('cancel', handleCancel, { once: true })
  input.click()
})

const electronPlayerAPI = window.playerAPI || {
  selectAudio: selectBrowserAudio,
  savePlaylist: async () => ({ canceled: true }),
  loadPlaylist: async () => null,
  quit: async () => false,
  onAudioSelected() {},
  onSelectionFailed() {},
  onPlaylistLoaded() {},
  onPlaylistLoadFailed() {},
  onPlaylistSaveRequested() {},
  onNewPlaylistRequested() {}
}

const playlistCircularDLL = new window.CircularDLL()
const playQueue = new window.Queue()
const songHistory = []
const songItems = new Map()
const playbackModes = {
  sequential: 'Sequential',
  random: 'Random',
  shuffle: 'Shuffle'
}
let playbackMode = 'sequential'
let currentPlaylistNode = null
let currentSongNode = null
let selectedAlbum = null

const getFolderName = (folderPath) => folderPath.split(/[\\/]/).filter(Boolean).at(-1) || 'Unknown album'
const compareTracks = (left, right) => left.trackNumber - right.trackNumber || left.title.localeCompare(right.title)

class Song {
  constructor(songData) {
    Object.assign(this, songData)
  }
}

class PlaylistElement {
  constructor(type, path, songs, sortTracks = true) {
    this.type = type
    this.path = path
    this.songDLL = new window.DLL()
    songs.forEach((songData) => this.songDLL.append(new Song(songData)))
    if (type === 'album' && sortTracks) this.songDLL.quickSort(compareTracks)
    const firstSong = this.songDLL.getNodeAt(0).data
    this.title = type === 'album' ? (firstSong.album || getFolderName(path)) : firstSong.title
    this.artist = firstSong.artist || 'Unknown artist'
  }
}

const appendPlaylistElement = (playlistElement) => playlistCircularDLL.append(playlistElement)

const createPlaylistElement = (type, path, songs, sortTracks = true) => {
  return new PlaylistElement(type, path, songs, sortTracks)
}

const createPlaylistElements = (mode, selectedSongs) => {
  if (mode !== 'folder') return selectedSongs.map((song) => createPlaylistElement('song', song.filePath, [song]))

  const albumsByPath = new Map()
  for (const song of selectedSongs) {
    const folderPath = song.sourceFolderPath
    const albumSongs = albumsByPath.get(folderPath) || []
    albumSongs.push(song)
    albumsByPath.set(folderPath, albumSongs)
  }
  return [...albumsByPath].map(([folderPath, albumSongs]) => createPlaylistElement('album', folderPath, albumSongs))
}

const createLoadedPlaylistElements = (items) => items.map((item) => createPlaylistElement(item.type, item.path, item.songs, false))

const getTrackCount = () => {
  let trackCount = 0
  for (const playlistNode of playlistCircularDLL.nodes()) trackCount += playlistNode.data.songDLL.size
  return trackCount
}

const getNodeIndex = (list, targetNode) => {
  let index = 0
  for (const node of list.nodes()) {
    if (node === targetNode) return index
    index += 1
  }
  return -1
}

const getTrackLocations = () => {
  const locations = []
  for (const playlistNode of playlistCircularDLL.nodes()) {
    for (const songNode of playlistNode.data.songDLL.nodes()) locations.push({ playlistNode, songNode })
  }
  return locations
}

const findSongLocation = (song) => getTrackLocations().find((location) => location.songNode.data === song) || null
const sameLocation = (left, right) => left && right && left.playlistNode === right.playlistNode && left.songNode === right.songNode

const updateSelectedAlbumStatus = () => {
  selectedAlbumStatus.textContent = selectedAlbum
    ? `Selected album: ${selectedAlbum.title}`
    : 'Choose an album track to sort its songs.'
}

const shuffle = (items) => {
  const shuffledItems = [...items]
  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const replacementIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffledItems[index], shuffledItems[replacementIndex]] = [shuffledItems[replacementIndex], shuffledItems[index]]
  }
  return shuffledItems
}

const serializePlaylist = () => [...playlistCircularDLL.nodes()].map((playlistNode) => ({
  type: playlistNode.data.type,
  path: playlistNode.data.path,
  songs: [...playlistNode.data.songDLL.nodes()].map((songNode) => songNode.data.filePath)
}))

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds)) return ''
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
}

const getQueueSongLabel = (song) => {
  return song.artist ? `${song.title} · ${song.artist}` : song.title
}

const appendQueueItem = (position, song, isCurrent = false) => {
  const item = document.createElement('li')
  const positionLabel = document.createElement('span')
  const songLabel = document.createElement('span')

  if (isCurrent) item.className = 'current-track'
  
  positionLabel.className = 'queue-position'
  positionLabel.textContent = isCurrent ? 'Now' : `Next ${position}`
  songLabel.className = 'queue-song'
  songLabel.textContent = getQueueSongLabel(song)
  item.append(positionLabel, songLabel)
  playbackQueueList.append(item)
}

const updatePlaybackNavigation = () => {
  previousTrackButton.disabled = songHistory.length === 0
  nextTrackButton.disabled = !currentPlaylistNode || !currentSongNode || getTrackCount() < 2 ||
    (playbackMode === 'sequential' && playQueue.size === 0)
}

const renderPlaybackQueue = () => {
  playbackQueueList.replaceChildren()
  if (!currentPlaylistNode || !currentSongNode) {
    queueCount.textContent = 'No songs queued'
    const emptyState = document.createElement('li')
    emptyState.className = 'empty-queue'
    emptyState.textContent = 'Choose audio to see the playing order.'
    playbackQueueList.append(emptyState)
    updatePlaybackNavigation()
    return
  }

  appendQueueItem(0, currentSongNode.data, true)
  let position = 1
  for (const song of playQueue.entries()) {
    appendQueueItem(position, song)
    position += 1
  }
  const nextLabel = playQueue.size === 0
    ? (playbackMode === 'sequential' ? 'End of playlist' : 'No songs up next')
    : `${playQueue.size} song${playQueue.size === 1 ? '' : 's'} up next`
  queueCount.textContent = `${playbackModes[playbackMode]} · ${nextLabel}`
  updatePlaybackNavigation()
}

const enqueueSongNodes = (songNodes) => songNodes.forEach((songNode) => playQueue.enqueue(songNode.data))

const buildSequentialQueue = (playlistNode, songNode) => {
  const tracks = getTrackLocations()
  const currentIndex = tracks.findIndex((location) => sameLocation(location, { playlistNode, songNode }))
  if (currentIndex >= 0) tracks.slice(currentIndex + 1).forEach((location) => playQueue.enqueue(location.songNode.data))
}

const buildRandomQueue = () => {
  const tracks = getTrackLocations()
  for (let index = 1; index < tracks.length; index += 1) playQueue.enqueue(tracks[Math.floor(Math.random() * tracks.length)].songNode.data)
}

const buildShuffleQueue = (playlistNode, songNode) => {
  const songNodes = [...playlistNode.data.songDLL.nodes()]
  const currentSongIndex = songNodes.indexOf(songNode)
  if (currentSongIndex < 0) return
  enqueueSongNodes(songNodes.slice(currentSongIndex + 1))
  shuffle([...playlistCircularDLL.nodes()].filter((node) => node !== playlistNode)).forEach((node) => enqueueSongNodes([...node.data.songDLL.nodes()]))
  enqueueSongNodes(songNodes.slice(0, currentSongIndex))
}

const buildPlayQueue = (playlistNode, songNode) => {
  playQueue.clear()
  if (getTrackCount() < 2) return
  if (playbackMode === 'random') buildRandomQueue()
  else if (playbackMode === 'shuffle') buildShuffleQueue(playlistNode, songNode)
  else buildSequentialQueue(playlistNode, songNode)
}

const getInitialLocation = () => {
  const tracks = getTrackLocations()
  if (tracks.length === 0) return null
  if (playbackMode === 'random') return tracks[Math.floor(Math.random() * tracks.length)]
  if (playbackMode === 'shuffle') {
    const playlistNodes = [...playlistCircularDLL.nodes()]
    const playlistNode = playlistNodes[Math.floor(Math.random() * playlistNodes.length)]
    return { playlistNode, songNode: playlistNode.data.songDLL.getNodeAt(0) }
  }
  return tracks[0]
}

const updateTrackNumber = () => {
  const currentIndex = getTrackLocations().findIndex((location) => location.playlistNode === currentPlaylistNode && location.songNode === currentSongNode)
  trackNumber.textContent = currentIndex >= 0 ? String(currentIndex + 1).padStart(2, '0') : '00'
}

const playSong = async (playlistNode, songNode, rebuildQueue = true) => {
  const song = songNode.data
  const item = songItems.get(songNode)
  if (!item) return

  if (rebuildQueue) songHistory.length = 0
  currentPlaylistNode = playlistNode
  currentSongNode = songNode
  if (playlistNode.data.type === 'album') {
    selectedAlbum = playlistNode.data
    updateSelectedAlbumStatus()
  }
  if (rebuildQueue) buildPlayQueue(playlistNode, songNode)
  renderPlaybackQueue()
  updateTrackNumber()
  player.src = song.url
  nowPlaying.textContent = song.artist ? `${song.title} • ${song.artist}` : song.title
  trackArt.textContent = song.title.trim().charAt(0).toUpperCase() || 'J'
  songList.querySelector('.active')?.classList.remove('active')
  item.classList.add('active')

  try {
    await player.play()
    status.textContent = `Playing now: ${song.title}`
  } catch (error) {
    status.textContent = `Could not play "${song.title}": ${error.message}`
  }
}

const playNextTrack = async () => {
  if (!currentPlaylistNode || !currentSongNode) {
    await startFirstSong()
    return
  }

  let nextSong = playQueue.dequeue()
  if (nextSong === null && playbackMode !== 'sequential') {
    buildPlayQueue(currentPlaylistNode, currentSongNode)
    nextSong = playQueue.dequeue()
  }
  if (nextSong === null) {
    status.textContent = playbackMode === 'sequential' ? 'Playlist finished.' : 'There is no next track.'
    renderPlaybackQueue()
    return
  }

  const nextLocation = findSongLocation(nextSong)
  if (!nextLocation) return
  songHistory.push(currentSongNode.data)
  await playSong(nextLocation.playlistNode, nextLocation.songNode, false)
}

const playPreviousTrack = async () => {
  const previousSong = songHistory.pop()
  if (!previousSong || !currentPlaylistNode || !currentSongNode) {
    status.textContent = 'There is no previous track.'
    renderPlaybackQueue()
    return
  }

  const previousLocation = findSongLocation(previousSong)
  if (!previousLocation) return
  playQueue.prepend(currentSongNode.data)
  await playSong(previousLocation.playlistNode, previousLocation.songNode, false)
}

const createTrackActionButton = (label, ariaLabel, handler, disabled = false) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'track-action'
  button.textContent = label
  button.setAttribute('aria-label', ariaLabel)
  button.title = ariaLabel
  button.disabled = disabled
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    handler()
  })
  return button
}

const renderSongs = () => {
  songList.replaceChildren()
  songItems.clear()
  const trackCount = getTrackCount()
  songCount.textContent = `${trackCount} ${trackCount === 1 ? 'track' : 'tracks'}`
  if (playlistCircularDLL.size === 0) {
    const emptyState = document.createElement('li')
    emptyState.className = 'empty-playlist'
    emptyState.textContent = 'Your playlist is empty. Add a song, album, or saved playlist to begin.'
    songList.append(emptyState)
    return
  }

  for (const playlistNode of playlistCircularDLL.nodes()) {
    const playlistElement = playlistNode.data
    const songNodes = [...playlistElement.songDLL.nodes()]
    songNodes.forEach((songNode, songIndex) => {
      const song = songNode.data
      const item = document.createElement('li')
      const details = document.createElement('div')
      const title = document.createElement('span')
      const artist = document.createElement('span')
      const actions = document.createElement('div')
      const playlistIndex = getNodeIndex(playlistCircularDLL, playlistNode)
      const isAlbumTrack = playlistElement.type === 'album'
      const canMoveUp = isAlbumTrack ? songIndex > 0 : playlistIndex > 0
      const canMoveDown = isAlbumTrack ? songIndex < songNodes.length - 1 : playlistIndex < playlistCircularDLL.size - 1

      item.className = 'playlist-track'
      if (playlistNode === currentPlaylistNode && songNode === currentSongNode) item.classList.add('active')
      if (playlistElement === selectedAlbum) item.classList.add('album-selected')
      title.className = 'song-title'
      title.textContent = song.title
      artist.className = 'song-artist'
      artist.textContent = song.artist || 'Unknown artist'
      details.className = 'song-details'
      details.append(title, artist)
      actions.className = 'track-actions'
      actions.append(
        createTrackActionButton('↑', `Move ${song.title} up`, () => moveSong(playlistNode, songNode, -1), !canMoveUp),
        createTrackActionButton('↓', `Move ${song.title} down`, () => moveSong(playlistNode, songNode, 1), !canMoveDown),
        createTrackActionButton('×', `Remove ${song.title}`, () => removeSong(playlistNode, songNode))
      )
      item.append(details, actions)
      item.addEventListener('click', () => playSong(playlistNode, songNode))
      item.tabIndex = 0
      item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          playSong(playlistNode, songNode)
        }
        if (event.key === 'Delete') {
          event.preventDefault()
          removeSong(playlistNode, songNode)
        }
      })
      songItems.set(songNode, item)
      songList.append(item)
    })
  }
}

const releaseSongUrl = (song) => {
  if (song?.url?.startsWith('blob:')) URL.revokeObjectURL(song.url)
}

const releasePlaylistUrls = () => {
  for (const { songNode } of getTrackLocations()) releaseSongUrl(songNode.data)
}

const stopPlayback = () => {
  player.pause()
  player.removeAttribute('src')
  player.load()
  currentPlaylistNode = null
  currentSongNode = null
  playQueue.clear()
  songHistory.length = 0
  nowPlaying.textContent = 'No track selected'
  trackArt.textContent = 'J'
  trackNumber.textContent = '00'
}

const refreshAfterStructureChange = (playingSong) => {
  songHistory.length = 0
  const currentLocation = playingSong ? findSongLocation(playingSong) : null
  if (currentLocation) {
    currentPlaylistNode = currentLocation.playlistNode
    currentSongNode = currentLocation.songNode
    buildPlayQueue(currentPlaylistNode, currentSongNode)
  } else if (playingSong) {
    stopPlayback()
  }
  renderSongs()
  renderPlaybackQueue()
  updateTrackNumber()
}

const moveSong = (playlistNode, songNode, direction) => {
  const playingSong = currentSongNode?.data
  const playlistElement = playlistNode.data
  if (playlistElement.type === 'album') {
    const currentIndex = getNodeIndex(playlistElement.songDLL, songNode)
    const targetIndex = currentIndex + direction
    if (targetIndex < 0 || targetIndex >= playlistElement.songDLL.size) return
    playlistElement.songDLL.moveAt(currentIndex, targetIndex)
  } else {
    const currentIndex = getNodeIndex(playlistCircularDLL, playlistNode)
    const targetIndex = currentIndex + direction
    if (targetIndex < 0 || targetIndex >= playlistCircularDLL.size) return
    playlistCircularDLL.moveAt(currentIndex, targetIndex)
  }
  refreshAfterStructureChange(playingSong)
  status.textContent = playlistElement.type === 'album' ? `Moved ${songNode.data.title} within its album.` : `Moved ${songNode.data.title} in the playlist.`
}

const getSequentialSuccessor = (playlistNode, songNode) => {
  const tracks = getTrackLocations()
  const index = tracks.findIndex((location) => sameLocation(location, { playlistNode, songNode }))
  return index < 0 || tracks.length < 2 ? null : tracks[(index + 1) % tracks.length]
}

const removeSong = (playlistNode, songNode) => {
  const song = songNode.data
  const playingSong = currentSongNode?.data
  const successor = playingSong === song ? getSequentialSuccessor(playlistNode, songNode) : null
  const playlistElement = playlistNode.data
  const songIndex = getNodeIndex(playlistElement.songDLL, songNode)
  if (songIndex < 0) return

  playlistElement.songDLL.removeAt(songIndex)
  if (playlistElement.songDLL.size === 0) {
    playlistCircularDLL.removeAt(getNodeIndex(playlistCircularDLL, playlistNode))
    if (playlistElement === selectedAlbum) {
      selectedAlbum = null
      updateSelectedAlbumStatus()
    }
  }
  releaseSongUrl(song)
  if (playingSong === song) {
    renderSongs()
    if (successor && songItems.has(successor.songNode)) playSong(successor.playlistNode, successor.songNode)
    else {
      stopPlayback()
      renderSongs()
      renderPlaybackQueue()
    }
  } else {
    refreshAfterStructureChange(playingSong)
  }
  status.textContent = playlistElement.type === 'album' && playlistElement.songDLL.size === 0
    ? `Removed ${song.title} and its now-empty album.`
    : `Removed ${song.title}.`
}

const sortPlaylistByArtist = () => {
  const playingSong = currentSongNode?.data
  playlistCircularDLL.quickSort((left, right) => left.artist.localeCompare(right.artist) || left.title.localeCompare(right.title))
  refreshAfterStructureChange(playingSong)
  status.textContent = 'Playlist sorted by artist.'
}

const sortAlbumsByTrackNumber = () => {
  const playingSong = currentSongNode?.data
  if (!selectedAlbum) {
    status.textContent = 'Choose a song from an album before sorting its tracks.'
    return
  }
  selectedAlbum.songDLL.quickSort(compareTracks)
  refreshAfterStructureChange(playingSong)
  status.textContent = `Sorted ${selectedAlbum.title} by track number.`
}

const updatePlaybackModeButtons = () => {
  document.querySelectorAll('[data-playback-mode]').forEach((button) => {
    const isActive = button.dataset.playbackMode === playbackMode
    button.classList.toggle('active-mode', isActive)
    button.setAttribute('aria-pressed', String(isActive))
  })
}

const setPlaybackMode = (mode) => {
  if (!Object.hasOwn(playbackModes, mode)) return
  playbackMode = mode
  songHistory.length = 0
  updatePlaybackModeButtons()
  if (currentPlaylistNode && currentSongNode) buildPlayQueue(currentPlaylistNode, currentSongNode)
  renderPlaybackQueue()
  status.textContent = `${playbackModes[mode]} playback selected.`
}

const startFirstSong = async () => {
  const location = getInitialLocation()
  if (location) await playSong(location.playlistNode, location.songNode)
}

const addSelectedSongs = async (mode, selectedSongs) => {
  if (selectedSongs.length === 0) {
    status.textContent = 'No supported MP3 or FLAC files were selected.'
    return
  }
  const playingSong = currentSongNode?.data
  if (mode === 'open') {
    releasePlaylistUrls()
    playlistCircularDLL.clear()
    stopPlayback()
    selectedAlbum = null
    updateSelectedAlbumStatus()
  }
  createPlaylistElements(mode, selectedSongs).forEach(appendPlaylistElement)
  if (playingSong && mode !== 'open') refreshAfterStructureChange(playingSong)
  else {
    renderSongs()
    renderPlaybackQueue()
    await startFirstSong()
  }
  status.textContent = `Added ${selectedSongs.length} audio file(s).`
}

const replacePlaylist = async (items) => {
  releasePlaylistUrls()
  playlistCircularDLL.clear()
  stopPlayback()
  selectedAlbum = null
  updateSelectedAlbumStatus()
  createLoadedPlaylistElements(items).forEach(appendPlaylistElement)
  renderSongs()
  renderPlaybackQueue()
  const trackCount = getTrackCount()
  if (trackCount === 0) {
    status.textContent = 'Loaded an empty playlist.'
    return
  }
  status.textContent = `Loaded playlist with ${trackCount} audio file(s).`
  await startFirstSong()
}

const createNewPlaylist = () => {
  releasePlaylistUrls()
  playlistCircularDLL.clear()
  stopPlayback()
  selectedAlbum = null
  updateSelectedAlbumStatus()
  renderSongs()
  renderPlaybackQueue()
  status.textContent = 'Created a new empty playlist.'
}

const savePlaylist = async () => {
  try {
    const result = await electronPlayerAPI.savePlaylist(serializePlaylist())
    if (!result.canceled) status.textContent = `Playlist saved to ${result.filePath}.`
  } catch (error) {
    status.textContent = `Could not save playlist: ${error.message}`
  }
}

const loadPlaylist = async () => {
  try {
    const items = await electronPlayerAPI.loadPlaylist()
    if (items) await replacePlaylist(items)
  } catch (error) {
    status.textContent = `Could not load playlist: ${error.message}`
  }
}

const selectAudio = async (mode) => {
  status.textContent = ''
  try {
    await addSelectedSongs(mode, await electronPlayerAPI.selectAudio(mode))
  } catch (error) {
    status.textContent = `Could not select audio files: ${error.message}`
  }
}

document.getElementById('chooseFilesBtn').addEventListener('click', () => selectAudio('add'))
document.getElementById('chooseFolderBtn').addEventListener('click', () => selectAudio('folder'))
document.getElementById('newPlaylistBtn').addEventListener('click', createNewPlaylist)
document.getElementById('loadPlaylistBtn').addEventListener('click', loadPlaylist)
document.getElementById('savePlaylistBtn').addEventListener('click', savePlaylist)
document.getElementById('exitBtn').addEventListener('click', () => electronPlayerAPI.quit())
document.getElementById('sortArtistsBtn').addEventListener('click', sortPlaylistByArtist)
document.getElementById('sortTracksBtn').addEventListener('click', sortAlbumsByTrackNumber)
document.querySelectorAll('[data-playback-mode]').forEach((button) => button.addEventListener('click', () => setPlaybackMode(button.dataset.playbackMode)))
previousTrackButton.addEventListener('click', playPreviousTrack)
nextTrackButton.addEventListener('click', playNextTrack)

electronPlayerAPI.onAudioSelected((mode, selectedSongs) => { addSelectedSongs(mode, selectedSongs) })
electronPlayerAPI.onSelectionFailed((message) => { status.textContent = `Could not select audio files: ${message}` })
electronPlayerAPI.onPlaylistLoaded((items) => {
  replacePlaylist(items).catch((error) => { status.textContent = `Could not load playlist: ${error.message}` })
})
electronPlayerAPI.onPlaylistLoadFailed((message) => { status.textContent = `Could not load playlist: ${message}` })
electronPlayerAPI.onPlaylistSaveRequested(() => { savePlaylist() })
electronPlayerAPI.onNewPlaylistRequested(createNewPlaylist)

player.addEventListener('loadedmetadata', () => {
  const duration = formatDuration(player.duration)
  if (duration) nowPlaying.textContent += ` • ${duration}`
})

player.addEventListener('ended', () => { playNextTrack() })

updatePlaybackModeButtons()
updateSelectedAlbumStatus()
renderSongs()
renderPlaybackQueue()
