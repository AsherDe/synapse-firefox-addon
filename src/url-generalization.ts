/**
 * URL Generalization Module
 * 
 * This module implements URL generalization functionality for privacy-preserving
 * user behavior analysis. It extracts meaningful features from URLs without
 * storing sensitive information.
 * 
 * Currently implements rule-based pattern matching.
 * Future versions will incorporate ML-based classification.
 */

/**
 * Simple string hash function for privacy protection
 */
function simpleStringHash(str: string): number {
  let hash = 0;
  if (str.length === 0) return hash;
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash);
}

/**
 * URL generalization features interface
 */
interface URLGeneralizationFeatures {
  // Domain features
  domain: string;
  domain_hash: number;
  
  // Page type classification
  page_type: string;
  page_type_confidence: number;
  
  // Path structure analysis
  path_depth: number;
  path_component_types: string[];
  path_keywords: string[];
  
  // Query parameter analysis
  query_param_count: number;
  query_param_keys: string[];
  query_param_key_hash: number;
  
  // Fragment identifier
  has_fragment: boolean;
}

/**
 * Context extractor for content-based page type inference
 */
class ContextExtractor {
  /**
   * Extract keywords from page title
   */
  public extractKeywordsFromTitle(title: string): string[] {
    if (!title) return [];
    
    const keywords = title.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .slice(0, 5); // Limit to first 5 keywords
    
    return keywords;
  }
  
  /**
   * Extract keywords from H1 element
   */
  public extractKeywordsFromH1(): string[] {
    const h1Element = document.querySelector('h1');
    if (!h1Element) return [];
    
    return this.extractKeywordsFromTitle(h1Element.textContent || '');
  }
  
  /**
   * Infer page type from content
   */
  public inferPageTypeFromContent(): { type: string; confidence: number } {
    const title = document.title;
    const h1Text = document.querySelector('h1')?.textContent || '';
    const combinedText = (title + ' ' + h1Text).toLowerCase();
    
    // Search results patterns
    if (combinedText.includes('search results') || 
        combinedText.includes('results for') ||
        combinedText.match(/\d+\s+results?/)) {
      return { type: 'search_results', confidence: 0.9 };
    }
    
    // Shopping cart patterns
    if (combinedText.includes('shopping cart') || 
        combinedText.includes('your cart') ||
        combinedText.includes('basket')) {
      return { type: 'shopping_cart', confidence: 0.8 };
    }
    
    // Article detail patterns
    if (combinedText.match(/\b(article|blog|post|news)\b/) && 
        document.querySelectorAll('p').length > 5) {
      return { type: 'article_detail', confidence: 0.7 };
    }
    
    // Settings patterns
    if (combinedText.includes('settings') || 
        combinedText.includes('preferences') ||
        combinedText.includes('configuration')) {
      return { type: 'settings', confidence: 0.8 };
    }
    
    return { type: 'unknown', confidence: 0.1 };
  }
}

/**
 * URL Generalization Engine
 */
class URLGeneralizationEngine {
  private contextExtractor: ContextExtractor;
  
  // Predefined keyword categories for path analysis
  private readonly pathKeywords = {
    create: ['new', 'create', 'add', 'upload'],
    edit: ['edit', 'update', 'modify', 'settings', 'preferences', 'config'],
    view: ['view', 'show', 'detail', 'watch', 'read'],
    list: ['list', 'all', 'dashboard', 'stream', 'feed', 'category'],
    search: ['search', 'query', 'find'],
    auth: ['login', 'logout', 'signin', 'signup', 'auth', 'account'],
    transaction: ['cart', 'checkout', 'buy', 'order', 'pricing', 'subscribe']
  };
  
  constructor() {
    this.contextExtractor = new ContextExtractor();
  }
  
  /**
   * Main function to generalize a URL
   */
  public generalizeURL(url: string, element?: HTMLElement): URLGeneralizationFeatures {
    const urlObj = new URL(url);
    
    return {
      // Domain features
      domain: urlObj.hostname,
      domain_hash: simpleStringHash(urlObj.hostname),
      
      // Page type classification (3-layer approach)
      ...this.inferPageType(urlObj, element),
      
      // Path structure analysis
      path_depth: this.calculatePathDepth(urlObj),
      path_component_types: this.analyzePathComponents(urlObj),
      path_keywords: this.extractPathKeywords(urlObj),
      
      // Query parameter analysis
      query_param_count: this.getQueryParamCount(urlObj),
      query_param_keys: this.getQueryParamKeys(urlObj),
      query_param_key_hash: this.getQueryParamKeyHash(urlObj),
      
      // Fragment identifier
      has_fragment: this.hasFragment(urlObj)
    };
  }
  
  /**
   * Layer 1: Heuristic-based page type inference
   */
  private inferPageTypeHeuristic(urlObj: URL): { type: string; confidence: number } {
    const url = urlObj.href.toLowerCase();
    const pathname = urlObj.pathname.toLowerCase();
    
    // Authentication patterns
    if (url.match(/\b(login|signin|auth)\b/)) {
      return { type: 'authentication', confidence: 0.9 };
    }
    
    // Search patterns
    if (url.match(/\b(search|query)\b/) || urlObj.searchParams.has('q') || urlObj.searchParams.has('query')) {
      return { type: 'search_results', confidence: 0.9 };
    }
    
    // Settings patterns
    if (url.match(/\b(settings|preferences|config)\b/)) {
      return { type: 'settings', confidence: 0.9 };
    }
    
    // Shopping patterns
    if (url.match(/\b(cart|checkout)\b/)) {
      return { type: 'shopping_cart', confidence: 0.8 };
    }
    
    // Blog/article patterns
    if (url.match(/\b(blog|news|article)\b/)) {
      return { type: 'article_list', confidence: 0.7 };
    }
    
    // Article detail patterns (path with numbers and slug)
    if (pathname.match(/\/\d+\/[a-z-]+/)) {
      return { type: 'article_detail', confidence: 0.6 };
    }
    
    // GitHub-specific patterns
    if (urlObj.hostname.includes('github.com')) {
      if (pathname.includes('/issues')) return { type: 'issue_tracker', confidence: 0.9 };
      if (pathname.includes('/pull')) return { type: 'pull_request', confidence: 0.9 };
      if (pathname.includes('/blob') || pathname.includes('/tree')) return { type: 'code_browser', confidence: 0.9 };
      return { type: 'code_repository', confidence: 0.8 };
    }
    
    return { type: 'unknown', confidence: 0.1 };
  }
  
  /**
   * Layer 2: Content-based page type inference
   */
  private inferPageTypeContent(): { type: string; confidence: number } {
    return this.contextExtractor.inferPageTypeFromContent();
  }
  
  /**
   * Layer 3: ML-based classification (placeholder for future implementation)
   */
  private inferPageTypeML(_urlObj: URL, _element?: HTMLElement): { type: string; confidence: number } {
    // TODO: Implement ML-based page type classification
    // This will be added in future versions
    return { type: 'unknown', confidence: 0.0 };
  }
  
  /**
   * Combined 3-layer page type inference
   */
  private inferPageType(urlObj: URL, element?: HTMLElement): { page_type: string; page_type_confidence: number } {
    // Layer 1: Heuristic-based (fast and reliable for known patterns)
    const heuristicResult = this.inferPageTypeHeuristic(urlObj);
    if (heuristicResult.confidence > 0.7) {
      return { page_type: heuristicResult.type, page_type_confidence: heuristicResult.confidence };
    }
    
    // Layer 2: Content-based (when URL structure is unclear)
    const contentResult = this.inferPageTypeContent();
    if (contentResult.confidence > heuristicResult.confidence) {
      return { page_type: contentResult.type, page_type_confidence: contentResult.confidence };
    }
    
    // Layer 3: ML-based (future implementation)
    const mlResult = this.inferPageTypeML(urlObj, element);
    if (mlResult.confidence > Math.max(heuristicResult.confidence, contentResult.confidence)) {
      return { page_type: mlResult.type, page_type_confidence: mlResult.confidence };
    }
    
    // Return best available result
    if (heuristicResult.confidence >= contentResult.confidence) {
      return { page_type: heuristicResult.type, page_type_confidence: heuristicResult.confidence };
    } else {
      return { page_type: contentResult.type, page_type_confidence: contentResult.confidence };
    }
  }
  
  /**
   * Calculate path depth
   */
  private calculatePathDepth(urlObj: URL): number {
    return urlObj.pathname.split('/').filter(segment => segment.length > 0).length;
  }
  
  /**
   * Analyze path components and classify their types
   */
  private analyzePathComponents(urlObj: URL): string[] {
    const pathSegments = urlObj.pathname.split('/').filter(segment => segment.length > 0);
    const componentTypes: string[] = [];
    
    for (const segment of pathSegments) {
      if (/^\d+$/.test(segment)) {
        // Pure numeric -> ID
        componentTypes.push('id');
      } else if (/^[a-z-]+$/.test(segment) && segment.includes('-') && segment.length > 10) {
        // Contains hyphens and is long -> slug (article/product title)
        componentTypes.push('slug');
      } else if (/^[a-z]+$/.test(segment) && segment.length <= 15) {
        // Pure letters and short -> category or endpoint
        componentTypes.push('category');
      } else {
        // Mixed or other patterns -> mixed
        componentTypes.push('mixed');
      }
    }
    
    return componentTypes;
  }
  
  /**
   * Extract meaningful keywords from path
   */
  private extractPathKeywords(urlObj: URL): string[] {
    const pathLower = urlObj.pathname.toLowerCase();
    const foundKeywords: string[] = [];
    
    for (const [category, keywords] of Object.entries(this.pathKeywords)) {
      for (const keyword of keywords) {
        if (pathLower.includes(keyword)) {
          foundKeywords.push(category);
          break; // Only add category once
        }
      }
    }
    
    return foundKeywords;
  }
  
  /**
   * Get query parameter count
   */
  private getQueryParamCount(urlObj: URL): number {
    return Array.from(urlObj.searchParams.keys()).length;
  }
  
  /**
   * Get query parameter keys (not values for privacy)
   */
  private getQueryParamKeys(urlObj: URL): string[] {
    return Array.from(urlObj.searchParams.keys()).sort();
  }
  
  /**
   * Get hash of sorted query parameter keys
   */
  private getQueryParamKeyHash(urlObj: URL): number {
    const keys = this.getQueryParamKeys(urlObj);
    const keyString = keys.join(',');
    return simpleStringHash(keyString);
  }
  
  /**
   * Check if URL has fragment identifier
   */
  private hasFragment(urlObj: URL): boolean {
    return urlObj.hash.length > 0;
  }
}

// Export the main class and utility functions
export { URLGeneralizationEngine, URLGeneralizationFeatures, simpleStringHash };