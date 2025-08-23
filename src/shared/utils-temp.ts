// URL generalization function (inlined from url-generalization.ts)
function generateGeneralizedURL(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/').filter(p => p.length > 0);
    
    // Generalize path segments
    const generalizedSegments = pathSegments.map(segment => {
      // Keep common patterns but generalize specific content
      if (/^\d+$/.test(segment)) return '[ID]';
      if (segment.length > 15) return '[CONTENT]';
      if (/^[a-f0-9-]{32,}$/i.test(segment)) return '[HASH]';
      if (/^[a-f0-9-]{8,}$/i.test(segment)) return '[TOKEN]';
      
      // Keep common path keywords
      const commonPaths = ['api', 'admin', 'user', 'users', 'profile', 'settings', 'search', 'login', 'logout', 'home', 'about', 'contact', 'help', 'docs', 'wiki', 'forms', 'post'];
      if (commonPaths.includes(segment.toLowerCase())) {
        return segment.toLowerCase();
      }
      
      // For everything else, use a placeholder
      return '[PATH]';
    });
    
    // Reconstruct URL
    let generalizedURL = `${urlObj.protocol}//${urlObj.hostname}`;
    if (generalizedSegments.length > 0) {
      generalizedURL += '/' + generalizedSegments.join('/');
    }
    
    // Add query parameters in generalized form
    if (urlObj.search) {
      const paramCount = Array.from(urlObj.searchParams.keys()).length;
      if (paramCount > 0) {
        generalizedURL += `?[${paramCount}_PARAMS]`;
      }
    }
    
    // Add fragment indicator
    if (urlObj.hash) {
      generalizedURL += '#[FRAGMENT]';
    }
    
    return generalizedURL;
  } catch (e) {
    return url; // Return original if parsing fails
  }
}
