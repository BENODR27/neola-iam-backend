const jwt = require("jsonwebtoken");
const { User, Role, Permission, UserAccessScope } = require("../models");
const HttpError = require("../errors/HttpError");

module.exports = async (req, res, next) => {
  try {
    const header = req.get("authorization") || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token)
      throw new HttpError(401, "Bearer token required");

    let claims;
    try {
      claims = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ["HS256"],
        issuer: process.env.JWT_ISSUER || "platform-iam",
        audience: process.env.JWT_AUDIENCE || "platform-applications",
      });
    } catch {
      throw new HttpError(401, "Invalid or expired token");
    }

    const user = await User.findOne({
      where: { employeeCode: claims.sub },
      include: [
        {
          model: Role,
          as: "roles",
          through: { attributes: [] },
          include: [
            {
              model: Permission,
              as: "permissions",
              through: { attributes: [] },
            },
          ],
        },
        {
          model: UserAccessScope,
          as: "accessScopes",
          where: { enabled: true },
          required: false,
        },
      ],
    });
    if (!user || !user.isActive)
      throw new HttpError(401, "User is unavailable");
    if ((claims.sessionVersion ?? 0) !== user.sessionVersion) {
      throw new HttpError(401, "User session was ended by an administrator");
    }
    await require('../services/subscription-access').apply(user);
    req.user = user;
    req.authClaims = claims;
    next();
  } catch (error) {
    next(error);
  }
};
