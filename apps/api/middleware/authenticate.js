function createAuthenticate({
  jwt,
  jwtSecret,
  resolveTokenAccess,
  findApiKeys,
  ownerPermissions,
  allowedPermissions = ['dashboard'],
}) {
  return async function authenticate(req, res, next) {
    const token = req.headers.authorization;
    const apiKey = req.headers['x-api-token'];

    if (!token && !apiKey) {
      return res.status(401).json({
        message: 'Authentication failed. No token or API key provided.',
      });
    }

    if (token) {
      const extractedToken = token.split(' ')[1];
      if (!extractedToken || extractedToken === 'null') return res.sendStatus(403);

      try {
        const decoded = jwt.verify(extractedToken, jwtSecret);
        const access = await resolveTokenAccess(decoded.user);
        if (!allowedPermissions.some(permission => access.permissions?.[permission])) {
          return res.status(403).json({ message: 'This account is disabled in Silo Barracks' });
        }
        req.user = access.user;
        req.permissions = access.permissions;
        return next();
      } catch {
        console.log('Invalid token');
        return res.status(401).json({ message: 'Invalid token' });
      }
    }

    const keys = await findApiKeys();
    if (!keys || keys.length === 0) return res.status(404).json({ message: 'No API keys configured' });
    if (!keys.some(entry => entry.key === apiKey)) return res.status(403).json({ message: 'Invalid API key' });
    req.permissions = ownerPermissions;
    return next();
  };
}

module.exports = { createAuthenticate };
