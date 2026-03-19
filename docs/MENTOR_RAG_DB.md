# Mentor Chat — DB-Based RAG

The Mentor Chat uses **only the DB schema and APIs**. No external RAG service. No demo/mock content.

---

## Flow

1. User selects a **track** (LLMs, Prompt Engineering, RAG, etc.) during skill selection.
2. User completes assessment → gets learning path with stages.
3. User enters a stage → uses Mentor Chat.
4. Chat uses **track_id** (user's chosen category) and **stage_id** to fetch context from DB.
5. Context = `knowledge_base` (by track_id) + `stage_content` (by stage_id).
6. LLM (ai_provider) answers using that context only.
7. All messages stored in `chat_messages`.

---

## DB Tables Used

| Table | Purpose |
|-------|---------|
| `knowledge_base` | Track-specific content (track_id, content, source) |
| `stage_content` | Stage-specific content (title, description, content_text) |
| `chat_sessions` | Links user + stage |
| `chat_messages` | Stores every user and AI message |

---

## APIs

### Add knowledge (admin)

```
POST /api/chat/knowledge
{
  "track_id": 1,
  "content": "LLMs use transformer architecture...",
  "source": "Course notes"
}
```

`embedding_vector` is optional (defaults to "placeholder"). DB-based RAG uses `content` directly.

### Get knowledge by track

```
GET /api/chat/knowledge/track/{track_id}
```

### Chat flow

1. `POST /api/chat/sessions` — create session (stage_id)
2. `POST /api/chat/sessions/{chat_id}/messages` — send message, get RAG-grounded reply

---

## Adding Content

To make Mentor Chat useful, add content to `knowledge_base` for each track:

```bash
# Example: add LLMs content (track_id from your tracks table)
curl -X POST "http://localhost:8001/api/chat/knowledge" \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"track_id": 1, "content": "Large Language Models use transformer architecture. Key concepts: tokenization, embeddings, attention.", "source": "LLMs fundamentals"}'
```

`stage_content` is populated when learning content is generated for a path.
