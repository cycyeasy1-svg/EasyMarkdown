function isSplitScrollPeer({
  documentKey,
  editorDocumentKey,
  keepVisible,
  keepColumn,
  sourceColumn
}) {
  return (
    !!keepVisible &&
    documentKey === editorDocumentKey &&
    keepColumn != null &&
    sourceColumn != null &&
    keepColumn !== sourceColumn
  )
}

module.exports = { isSplitScrollPeer }
