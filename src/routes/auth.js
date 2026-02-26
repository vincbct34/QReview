/**
 * LinkedIn OAuth authentication routes (OpenID Connect)
 */
const express = require("express");
const passport = require("passport");
const OAuth2Strategy = require("passport-oauth2");
const logger = require("../utils/logger");

const router = express.Router();

// Configure Passport LinkedIn OpenID Connect strategy
if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
  const linkedinStrategy = new OAuth2Strategy(
    {
      authorizationURL: "https://www.linkedin.com/oauth/v2/authorization",
      tokenURL: "https://www.linkedin.com/oauth/v2/accessToken",
      clientID: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      callbackURL:
        (process.env.BASE_URL || "http://localhost:3000") +
        "/auth/linkedin/callback",
      scope: ["openid", "profile", "email"],
      state: false,
    },
    async (accessToken, refreshToken, params, profile, done) => {
      try {
        // Fetch user info from LinkedIn OpenID Connect endpoint
        const response = await fetch("https://api.linkedin.com/v2/userinfo", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          logger.error(
            { status: response.status },
            "Failed to fetch LinkedIn user info",
          );
          return done(new Error("Failed to fetch user info"));
        }

        const userInfo = await response.json();

        // LinkedIn OpenID Connect returns: sub, name, given_name, family_name, email, picture
        const userData = {
          id: userInfo.sub,
          linkedinId: userInfo.sub,
          name: userInfo.name || "",
          firstName: userInfo.given_name || "",
          lastName: userInfo.family_name || "",
          email: userInfo.email || "",
          profileUrl: "", // OpenID Connect doesn't provide vanity URL directly
          verified: true,
        };

        logger.info(
          { linkedinId: userData.linkedinId },
          "LinkedIn authentication successful",
        );
        return done(null, userData);
      } catch (error) {
        logger.error({ error: error.message }, "LinkedIn authentication error");
        return done(error);
      }
    },
  );

  linkedinStrategy.name = "linkedin";
  passport.use(linkedinStrategy);

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user));
}

// Initiate LinkedIn OAuth flow
router.get("/linkedin", (req, res, next) => {
  if (!process.env.LINKEDIN_CLIENT_ID || !process.env.LINKEDIN_CLIENT_SECRET) {
    logger.error("LinkedIn credentials not configured");
    return res
      .status(503)
      .json({ error: "LinkedIn authentication not configured" });
  }
  logger.info("Initiating LinkedIn OAuth flow");
  passport.authenticate("linkedin")(req, res, next);
});

// LinkedIn OAuth callback
router.get("/linkedin/callback", (req, res, next) => {
  logger.info({ query: req.query }, "LinkedIn callback received");

  passport.authenticate("linkedin", { session: false }, (err, user, info) => {
    if (err) {
      logger.error(
        { error: err.message, stack: err.stack },
        "LinkedIn authentication error",
      );
      return res.redirect(
        "/?error=linkedin_auth_failed&details=" +
          encodeURIComponent(err.message),
      );
    }

    if (!user) {
      logger.error(
        { info },
        "LinkedIn authentication failed - no user returned",
      );
      return res.redirect("/?error=linkedin_auth_failed&details=no_user");
    }

    logger.info({ user }, "LinkedIn authentication successful");

    // Redirect to main page with user data
    const data = encodeURIComponent(JSON.stringify(user));
    res.redirect("/?linkedin_data=" + data);
  })(req, res, next);
});

// Get current LinkedIn session (if exists)
router.get("/session", (req, res) => {
  if (req.user) {
    res.json({ authenticated: true, user: req.user });
  } else {
    res.json({ authenticated: false });
  }
});

module.exports = router;
