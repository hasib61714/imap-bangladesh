// ── auth.controller — HTTP ONLY ───────────────────────────
// Maps req → service call → res. No business logic, no SQL.
// Errors carry an optional .status (set by the service via httpError()).
function createAuthController(service) {
  const handle = (fn) => async (req, res) => {
    try {
      const result = await fn(req);
      res.status(result.status || 200).json(result.body);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.status ? err.message : "Server error" });
    }
  };

  return {
    login: handle(async (req) => ({
      body: await service.login(req.body.identifier, req.body.password),
    })),
    register: handle(async (req) => ({
      status: 201,
      body: await service.register(req.body),
    })),
  };
}

module.exports = { createAuthController };
