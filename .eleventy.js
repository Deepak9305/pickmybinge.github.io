module.exports = function(eleventyConfig) {
  return {
    dir: {
      input: "src",
      includes: "_includes",  // ✅ inside src
      output: "_site"
    }
  };
};
