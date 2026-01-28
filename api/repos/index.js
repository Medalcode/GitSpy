export default function handler(req, res) {
  res.status(200).json({
    message: 'GitSpy API - Repos endpoints',
    usage: '/api/repos/:owner/:repo/kanban',
    example: '/api/repos/medalcode/GitSpy/kanban',
    note: 'Use the kanban endpoint with a real owner/repo. See README for details.'
  })
}
