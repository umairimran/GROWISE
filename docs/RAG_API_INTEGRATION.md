# RAG Integration — Complete Documentation

Grow Wise uses **DB-based RAG** for the **AI Mentor Chat** (knowledge_base + stage_content by user's chosen track). When a user asks a question in a learning stage, the app calls the RAG API with the track category and query, and returns the document-grounded answer.

---

## 1. API Endpoint

| Property | Value |
|----------|-------|
| **URL** | `POST {RAG_API_URL}/chat-by-category/` |
| **Default base** | `http://localhost:8000` |
| **Content-Type** | `multipart/form-data` |

---

## 2. Request

### Method and URL

```
POST http://localhost:8000/chat-by-category/
```

### Form fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `category` | string | Yes | — | One of: `LLMs`, `Prompt Engineering`, `RAG`, `AI API Integration`, `AI Agents` |
| `query` | string | Yes | — | User's question |
| `limit` | int | No | 5 | Retrieval limit |
| `alpha` | float | No | 0.5 | Hybrid search balance (0=keyword, 1=vector) |

### Category values (exact)

Pass the category **exactly** as below. Case is normalized by the API; spaces matter for multi-word categories.

| Category | Pass as | Also works |
|----------|--------|------------|
| LLMs | `LLMs` | `llms`, `LLMS` |
| Prompt Engineering | `Prompt Engineering` | `prompt engineering` |
| RAG | `RAG` | `rag` |
| AI API Integration | `AI API Integration` | `ai api integration` |
| AI Agents | `AI Agents` | `ai agents` |

---

## 3. Response

### Success (200 OK)

```json
{
  "answer": "The retrieved and generated answer text..."
}
```

### No documents (404)

```json
{
  "detail": "No documents found for category 'RAG'. Upload a document first."
}
```

---

## 4. Category filtering (exact logic)

### How documents are stored (on upload)

Collection name format:

```
{CategorySlug}__{DocumentSlug}
```

**Category slug rules:**

- Lowercase
- Spaces → underscores
- Non-alphanumeric → underscores
- First letter capitalized for Weaviate

**Examples:**

| Category | Slug | Example collection |
|----------|------|---------------------|
| LLMs | `llms` | `Llms__iac_beginners_manual` |
| Prompt Engineering | `prompt_engineering` | `Prompt_engineering__guide` |
| RAG | `rag` | `Rag__docs` |
| AI API Integration | `ai_api_integration` | `Ai_api_integration__reference` |
| AI Agents | `ai_agents` | `Ai_agents__tutorial` |

### How `/chat-by-category/` finds documents

1. Build prefix:
   ```python
   cat_prefix = category.strip().lower().replace(" ", "_") + "__"
   ```
   - `"LLMs"` → `"llms__"`
   - `"AI Agents"` → `"ai_agents__"`

2. Filter Weaviate collections (case-insensitive):
   - Match if `collection_name.lower().startswith(cat_prefix)`

3. Pick the latest:
   - Uses newest-first ordering, so the first match is the latest document.

---

## 5. Grow Wise track → RAG category mapping

Grow Wise track names are mapped to RAG categories as follows:

| Grow Wise track_name (DB) | RAG API category |
|---------------------------|------------------|
| Large Language Models (LLMs) | LLMs |
| LLMs | LLMs |
| Large Language Models | LLMs |
| Prompt Engineering | Prompt Engineering |
| RAG (Retrieval Augmented Generation) | RAG |
| RAG | RAG |
| Retrieval Augmented Generation | RAG |
| AI API Integration | AI API Integration |
| AI Agents | AI Agents |

If the track does not map to a supported category, the mentor falls back to mock/LLM behavior.

---

## 6. Where RAG is used in Grow Wise

| Component | Flow |
|-----------|------|
| **AI Mentor Chat** | User sends message → `get_mentor_response(track_name, user_message)` → if track maps to category, call RAG API → return answer |

RAG is **not** used for:

- Assessment question generation
- Answer evaluation
- Learning path generation
- Stage content generation
- Evaluation chatbot (interview questions)

---

## 7. Configuration

In `server/.env`:

```env
# Base URL of the external RAG service
# - Windows host (RAG on host):  http://localhost:8000
# - Docker (RAG in container):   http://app:8000  (use your RAG service name)
RAG_API_URL=http://localhost:8000

# Optional: request timeout in seconds (default 120)
RAG_TIMEOUT=120
```

**Where does the RAG app run?**
- **Windows host:** Use `http://localhost:8000`
- **Docker container:** Use the service name, e.g. `http://app:8000` (not localhost — containers can't reach host localhost)

---

## 8. Example requests

### cURL (Windows CMD)

```cmd
curl -X POST "http://localhost:8000/chat-by-category/" ^
  -F "category=LLMs" ^
  -F "query=Give me a summary of this document" ^
  -F "limit=5" ^
  -F "alpha=0.5"
```

### cURL (Unix / Git Bash)

```bash
curl -X POST "http://localhost:8000/chat-by-category/" \
  -F "category=LLMs" \
  -F "query=Give me a summary of this document" \
  -F "limit=5" \
  -F "alpha=0.5"
```

### Python (requests)

```python
import requests

resp = requests.post(
    "http://localhost:8000/chat-by-category/",
    data={
        "category": "LLMs",
        "query": "Give me a summary of this document",
        "limit": 5,
        "alpha": 0.5,
    },
    timeout=120,
)
print(resp.status_code, resp.json())
```

### JavaScript (fetch)

```javascript
const formData = new FormData();
formData.append("category", "LLMs");
formData.append("query", "Give me a summary of this document");
formData.append("limit", "5");
formData.append("alpha", "0.5");

const resp = await fetch("http://localhost:8000/chat-by-category/", {
  method: "POST",
  body: formData,
});
const data = await resp.json();
console.log(data.answer);
```

---

## 9. Error handling

| Scenario | Grow Wise behavior |
|---------|---------------------|
| RAG API returns 200 | Use `answer` as mentor response |
| RAG API returns 404 | Fall back to mock/LLM |
| RAG API timeout or error | Fall back to mock/LLM |
| Track not in mapping | Fall back to mock/LLM |

---

## 10. Adding new categories

To support a new RAG category:

1. Add it to `RAG_CATEGORIES` and `TRACK_TO_RAG_CATEGORY` in `server/app/services/rag_client.py`.
2. Ensure the external RAG service stores documents with the correct collection prefix for that category.
