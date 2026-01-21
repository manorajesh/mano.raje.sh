interface Env {
  PINTEREST_ACCESS_TOKEN: string;
}

interface PinterestPin {
  id: string;
  media?: {
    images?: {
      [key: string]: {
        url: string;
        width: number;
        height: number;
      };
    };
  };
  title?: string;
  description?: string;
  link?: string;
}

interface PinterestResponse {
  items: PinterestPin[];
  bookmark?: string;
}

interface BoardResponse {
  id: string;
  name: string;
  pin_count?: number;
}

const PINTEREST_API_BASE = "https://api.pinterest.com/v5";

// CORS headers for the response
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  const accessToken = env.PINTEREST_ACCESS_TOKEN;
  if (!accessToken) {
    return new Response(
      JSON.stringify({ error: "Pinterest API token not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const action = url.searchParams.get("action");

  try {
    if (action === "get-board") {
      // Get board info by username/board-name
      const username = url.searchParams.get("username");
      const boardName = url.searchParams.get("board");

      if (!username || !boardName) {
        return new Response(
          JSON.stringify({ error: "Missing username or board parameter" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const boardId = `${username}/${boardName}`;
      const response = await fetch(
        `${PINTEREST_API_BASE}/boards/${encodeURIComponent(boardId)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return new Response(
          JSON.stringify({
            error: `Pinterest API error: ${response.status}`,
            details: errorText,
          }),
          {
            status: response.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const board: BoardResponse = await response.json();
      return new Response(JSON.stringify(board), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get-pins") {
      // Get pins from a board
      const username = url.searchParams.get("username");
      const boardName = url.searchParams.get("board");
      const bookmark = url.searchParams.get("bookmark");

      if (!username || !boardName) {
        return new Response(
          JSON.stringify({ error: "Missing username or board parameter" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const boardId = `${username}/${boardName}`;
      const params = new URLSearchParams({
        page_size: "100", // Max allowed by Pinterest
      });

      if (bookmark) {
        params.set("bookmark", bookmark);
      }

      const response = await fetch(
        `${PINTEREST_API_BASE}/boards/${encodeURIComponent(boardId)}/pins?${params}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return new Response(
          JSON.stringify({
            error: `Pinterest API error: ${response.status}`,
            details: errorText,
          }),
          {
            status: response.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const data: PinterestResponse = await response.json();

      // Transform pins to a simpler format with best image URLs
      const pins = data.items.map((pin) => {
        let imageUrl = "";
        let thumbnailUrl = "";

        if (pin.media?.images) {
          const images = pin.media.images;
          // Prefer largest image
          const sizeOrder = [
            "1200x",
            "originals",
            "1080x1080",
            "600x",
            "564x",
            "474x",
            "400x300",
            "236x",
            "150x150",
          ];

          for (const size of sizeOrder) {
            if (images[size]?.url) {
              if (!imageUrl) {
                imageUrl = images[size].url;
              }
              if (
                (size === "236x" || size === "474x" || size === "400x300") &&
                !thumbnailUrl
              ) {
                thumbnailUrl = images[size].url;
              }
            }
          }

          // Fallback: use any available image
          if (!imageUrl) {
            const firstImage = Object.values(images)[0];
            if (firstImage?.url) {
              imageUrl = firstImage.url;
            }
          }
        }

        return {
          id: pin.id,
          url: imageUrl,
          thumbnailUrl: thumbnailUrl || imageUrl,
          title: pin.title || "",
          description: pin.description || "",
          link: pin.link || "",
        };
      });

      return new Response(
        JSON.stringify({
          pins,
          bookmark: data.bookmark || null,
          hasMore: !!data.bookmark,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Invalid action. Use action=get-board or action=get-pins",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};
