/**
 * HUNGERNADS - Moltbook API Client
 *
 * Thin wrapper around the Moltbook REST API (https://www.moltbook.com/api/v1).
 * Handles agent registration, submolt management, posts, and comments.
 *
 * All methods are fire-and-forget safe: errors are caught and logged,
 * never thrown to callers unless explicitly requested.
 *
 * Rate limits (from Moltbook docs):
 *   - General: 100 requests/minute
 *   - Posts: 1 per 30 minutes
 *   - Comments: 1 per 20 seconds, 50/day max
 *   - New agents (first 24h): stricter limits
 */

// ─── Types ────────────────────────────────────────────────────────

export interface MoltbookConfig {
  /** Moltbook API key (from agent registration). */
  apiKey: string;
  /** Base URL override (for testing). Defaults to production. */
  baseUrl?: string;
}

export interface MoltbookPost {
  /** Submolt to post in (e.g., "hungernads"). */
  submolt: string;
  /** Post title. */
  title: string;
  /** Post body (markdown supported). */
  content: string;
  /** Optional URL attachment. */
  url?: string;
}

export interface MoltbookComment {
  /** Post ID to comment on. */
  postId: string;
  /** Comment body. */
  content: string;
  /** Parent comment ID for threaded replies. */
  parentId?: string;
}

export interface MoltbookSubmolt {
  /** URL-safe name (lowercase, no spaces). */
  name: string;
  /** Display name shown in the UI. */
  displayName: string;
  /** Community description. */
  description: string;
}

/** Standard Moltbook API response envelope. */
interface MoltbookResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  hint?: string;
}

/** Post data returned from the API. */
export interface MoltbookPostData {
  id: string;
  title: string;
  content: string;
  submolt: string;
  created_at: string;
  url?: string;
}

// ─── Client ───────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://www.moltbook.com/api/v1';

export class MoltbookClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: MoltbookConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  // ── Core HTTP ─────────────────────────────────────────────────

  /**
   * Make an authenticated request to the Moltbook API.
   * Returns the parsed response body or null on failure.
   */
  private async request<T = unknown>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<MoltbookResponse<T> | null> {
    const url = `${this.baseUrl}${path}`;

    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      };

      const options: RequestInit = { method, headers };
      if (body && (method === 'POST' || method === 'PATCH')) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const data = await response.json() as MoltbookResponse<T>;

      if (!response.ok) {
        console.error(
          `[Moltbook] ${method} ${path} failed (${response.status}):`,
          data.error ?? 'Unknown error',
          data.hint ? `Hint: ${data.hint}` : '',
        );
        return data;
      }

      return data;
    } catch (err) {
      console.error(`[Moltbook] ${method} ${path} threw:`, err);
      return null;
    }
  }

  // ── Agent Status ──────────────────────────────────────────────

  /**
   * Check if the configured API key corresponds to a claimed agent.
   * Returns "claimed", "pending_claim", or null on error.
   */
  async getAgentStatus(): Promise<string | null> {
    const res = await this.request<{ status: string }>('GET', '/agents/status');
    return res?.data?.status ?? null;
  }

  // ── Submolt Management ────────────────────────────────────────

  /**
   * Create a new submolt (community).
   * Returns the submolt data or null on failure (e.g., already exists).
   */
  async createSubmolt(submolt: MoltbookSubmolt): Promise<unknown> {
    const res = await this.request('POST', '/submolts', {
      name: submolt.name,
      display_name: submolt.displayName,
      description: submolt.description,
    });

    if (res?.success) {
      console.log(`[Moltbook] Created submolt /m/${submolt.name}`);
    }
    return res?.data ?? null;
  }

  /**
   * Get submolt details. Returns null if it doesn't exist.
   */
  async getSubmolt(name: string): Promise<unknown> {
    const res = await this.request('GET', `/submolts/${name}`);
    return res?.data ?? null;
  }

  /**
   * Subscribe to a submolt.
   */
  async subscribeToSubmolt(name: string): Promise<boolean> {
    const res = await this.request('POST', `/submolts/${name}/subscribe`);
    return res?.success ?? false;
  }

  // ── Posts ──────────────────────────────────────────────────────

  /**
   * Create a post in a submolt.
   * Returns the post data or null on failure.
   *
   * Rate limit: 1 post per 30 minutes.
   */
  async createPost(post: MoltbookPost): Promise<MoltbookPostData | null> {
    const body: Record<string, unknown> = {
      submolt: post.submolt,
      title: post.title,
      content: post.content,
    };
    if (post.url) body.url = post.url;

    const res = await this.request<MoltbookPostData>('POST', '/posts', body);

    if (res?.success && res.data) {
      console.log(`[Moltbook] Posted to /m/${post.submolt}: "${post.title}"`);
      return res.data;
    }

    return null;
  }

  // ── Comments ──────────────────────────────────────────────────

  /**
   * Add a comment to a post.
   * Returns true on success.
   *
   * Rate limit: 1 per 20 seconds, 50/day max.
   */
  async createComment(comment: MoltbookComment): Promise<boolean> {
    const body: Record<string, unknown> = { content: comment.content };
    if (comment.parentId) body.parent_id = comment.parentId;

    const res = await this.request('POST', `/posts/${comment.postId}/comments`, body);
    return res?.success ?? false;
  }

  // ── Feed ──────────────────────────────────────────────────────

  /**
   * Get posts from a submolt feed.
   * Returns the post list or empty array on failure.
   */
  async getSubmoltFeed(
    submoltName: string,
    sort: 'hot' | 'new' | 'top' | 'rising' = 'new',
    limit: number = 10,
  ): Promise<unknown[]> {
    const res = await this.request<unknown[]>(
      'GET',
      `/posts?submolt=${submoltName}&sort=${sort}&limit=${limit}`,
    );
    return (res?.data as unknown[]) ?? [];
  }
}

// ─── Factory ──────────────────────────────────────────────────────

/**
 * Create a MoltbookClient from env vars.
 * Returns null if MOLTBOOK_API_KEY is not set.
 */
export function createMoltbookClient(env: {
  MOLTBOOK_API_KEY?: string;
}): MoltbookClient | null {
  if (!env.MOLTBOOK_API_KEY) {
    return null;
  }

  return new MoltbookClient({
    apiKey: env.MOLTBOOK_API_KEY,
  });
}
