const axios = require("axios");
const logger = require("./logger");

/**
 * Verify a SIRET number using the public API recherche-entreprises.api.gouv.fr
 * @param {string} siret - 14-digit SIRET number
 * @returns {Promise<{valid: boolean, company_name?: string}>}
 */
async function verifySiret(siret) {
  if (!siret || siret.length !== 14 || !/^\d{14}$/.test(siret)) {
    return { valid: false };
  }

  // Retry logic for network errors
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      // Use the public API recherche-entreprises.api.gouv.fr (no auth required)
      const response = await axios.get(
        `https://recherche-entreprises.api.gouv.fr/search?q=${siret}`,
        {
          timeout: 10000,
          headers: {
            Accept: "application/json",
            "User-Agent": "QReview/1.0 (Contact: github.com/vincbct34/QReview)",
          },
        },
      );

      if (
        response.data &&
        response.data.results &&
        response.data.results.length > 0
      ) {
        const result = response.data.results[0];

        // Verify the SIRET matches exactly
        if (result.siege && result.siege.siret === siret) {
          return {
            valid: true,
            company_name:
              result.nom_complet ||
              result.nom_raison_sociale ||
              "Entreprise vérifiée",
          };
        }
      }

      return { valid: false };
    } catch (error) {
      const isNetworkError =
        error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT" ||
        error.code === "ENOTFOUND" ||
        error.response?.status >= 500;

      if (isNetworkError && attempt < 2) {
        logger.warn(
          { siret, attempt, err: error.message },
          "SIRET verification failed, retrying...",
        );
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }

      logger.warn(
        { siret, err: error.message, status: error.response?.status },
        "SIRET verification failed",
      );
      return { valid: false };
    }
  }

  return { valid: false };
}

module.exports = { verifySiret };
