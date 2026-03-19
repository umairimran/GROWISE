# RAG Implementation Guide for Grow Wise

This guide explains **what** to build and **which sources** to use for RAG in your learning platform.

---

## 1. What RAG Will Do in Grow Wise

| Component | Current State | With RAG |
|-----------|---------------|----------|
| **AI Mentor Chat** | Generic mock responses | Answers grounded in track-specific docs, stage content, and curated knowledge |
| **Question Generation** | LLM-only from dimensions | Can pull from curated question banks and examples |
| **Evaluation Follow-ups** | LLM-only from context | More precise questions using stage content and assessment material |

**Primary target:** AI Mentor Chat — when a user asks a question in a learning stage, the AI should retrieve relevant content and answer from it.

---

## 2. Which Sources to Use (By Track)

Your tracks: **LLMs**, **Prompt Engineering**, **RAG**, **AI API Integration**, **AI Agents**.

### Option A: Curated External Sources (Recommended to Start)

| Track | Suggested Sources | Notes |
|-------|-------------------|-------|
| **Large Language Models (LLMs)** | [Anthropic docs](https://docs.anthropic.com), [OpenAI model docs](https://platform.openai.com/docs/models), [Hugging Face Transformers](https://huggingface.co/docs/transformers), [Andrej Karpathy's intro](https://karpathy.github.io/2023/03/27/nnn/) | Focus on transformer architecture, tokenization, embeddings, attention |
| **Prompt Engineering** | [OpenAI Prompt Guide](https://platform.openai.com/docs/guides/prompt-engineering), [Anthropic Prompt Library](https://docs.anthropic.com/claude/docs/prompt-engineering), [LangChain prompt templates](https://python.langchain.com/docs/modules/model_io/prompts/) | Zero-shot, few-shot, chain-of-thought, system prompts |
| **RAG (Retrieval Augmented Generation)** | [LangChain RAG docs](https://python.langchain.com/docs/use_cases/question_answering/), [LlamaIndex docs](https://docs.llamaindex.ai/), [Pinecone RAG guide](https://www.pinecone.io/learn/retrieval-augmented-generation/) | Chunking, embeddings, vector DBs, hybrid search |
| **AI API Integration** | [OpenAI API reference](https://platform.openai.com/docs/api-reference), [Anthropic API](https://docs.anthropic.com/claude/reference), [LangChain integrations](https://python.langchain.com/docs/integrations/) | Request design, streaming, error handling, rate limiting |
| **AI Agents** | [LangChain agents](https://python.langchain.com/docs/modules/agents/), [AutoGPT-style guides](https://github.com/Significant-Gravitas/Auto-GPT), [ReAct paper concepts](https://arxiv.org/abs/2210.03629) | Tool calling, memory, planning, orchestration |

### Option B: Internal Content (Already in Your DB)

| Source | Content | When to Index |
|--------|---------|---------------|
| `stage_content` | title, description, content_text, url | When content is generated for a learning path |
| `knowledge_base` | content, source | When you add curated docs via admin |
| `assessment_question_pool` | question_text, dimension | Optional: for question generation |

### Recommended Approach: Hybrid

1. **Seed `knowledge_base`** with track-specific curated content (markdown files or scraped docs).
2. **Index `stage_content`** when it’s generated (so mentor chat can use it).
3. Use both for retrieval in the AI mentor.

---

## 3. How to Build It (Architecture)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         RAG PIPELINE                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  INGEST (one-time or on content creation)                               │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                │
│  │ Raw content  │ → │ Chunk (500–  │ → │ Embed        │ → Vector DB    │
│  │ (docs, stage │   │ 1000 tokens) │   │ (OpenAI/     │   (pgvector)   │
│  │ content)     │   │ with overlap │   │ text-embed-  │                │
│  └──────────────┘   └──────────────┘   │ 3-small)     │                │
│                                        └──────────────┘                │
│                                                                         │
│  RETRIEVAL (on each user message)                                       │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                │
│  │ User query   │ → │ Embed query  │ → │ Vector       │ → Top-K chunks │
│  │ "How does    │   │              │   │ similarity   │   (k=5)         │
│  │  RAG work?"  │   │              │   │ search       │                │
│  └──────────────┘   └──────────────┘   └──────────────┘                │
│                                                                         │
│  GENERATION                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Prompt = System + Retrieved chunks + Chat history + User message  │  │
│  │ → LLM (GPT-4 / Gemini) → AI mentor response                      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Implementation Steps

### Step 1: Add pgvector to PostgreSQL

```sql
-- Install pgvector extension (requires extension to be available)
CREATE EXTENSION IF NOT EXISTS vector;

-- Alter knowledge_base to use real vector type
ALTER TABLE knowledge_base 
  ADD COLUMN IF NOT EXISTS embedding vector(1536);  -- 1536 for text-embedding-3-small

-- Create index for fast similarity search
CREATE INDEX ON knowledge_base 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

If pgvector is not available, you can keep `embedding_vector TEXT` and store base64-encoded vectors, then do similarity in Python (slower for large datasets).

### Step 2: Create Embedding Service

- Use **OpenAI `text-embedding-3-small`** (1536 dimensions) or **Gemini embedding** if you prefer.
- Add `embed_text(text: str) -> List[float]` and `embed_texts(texts: List[str]) -> List[List[float]]` for batch embedding.

### Step 3: Chunking Strategy

- **Chunk size:** 500–1000 tokens (~200–400 words).
- **Overlap:** 50–100 tokens between chunks.
- **Metadata:** Store `track_id`, `source`, `content_type` (e.g. `stage_content`, `knowledge_base`).

### Step 4: Ingestion Pipeline

1. **Curated content:** Create `server/knowledge/` with markdown files per track:
   ```
   knowledge/
     llms/
       transformers.md
       tokenization.md
       ...
     prompt_engineering/
       zero_shot.md
       chain_of_thought.md
       ...
     rag/
       chunking.md
       vector_search.md
       ...
   ```
2. **Script:** `scripts/ingest_knowledge.py` — read files, chunk, embed, insert into `knowledge_base`.
3. **On stage content creation:** When `stage_content` is saved, optionally embed and store in a separate table or unified `knowledge_base` with `source='stage_content'`.

### Step 5: Implement Real `search_knowledge_base`

Replace the mock in `ai_service.search_knowledge_base()`:

1. Embed the user query.
2. Run vector similarity search (e.g. `ORDER BY embedding <=> query_embedding LIMIT 5`).
3. Return `[{content, source}, ...]`.

### Step 6: Wire RAG into `get_mentor_response`

1. Call `search_knowledge_base(query, track_id, top_k=5)`.
2. Build prompt:
   ```
   System: You are an AI mentor for {track_name}. Use ONLY the following context to answer. If the context doesn't contain the answer, say so.
   
   Context:
   {retrieved_chunk_1}
   {retrieved_chunk_2}
   ...
   
   User: {user_message}
   ```
3. Call LLM with this prompt + chat history.
4. Return the response.

---

## 5. Content Sources: Practical Recommendations

### Easiest Start (No Scraping)

1. **Create markdown files** in `server/knowledge/{track_slug}/`:
   - Manually write or copy-paste from official docs.
   - One file per major topic (e.g. `rag/chunking.md`, `rag/embeddings.md`).
2. **Run ingestion script** to chunk, embed, and insert into DB.
3. **Test** via the mentor chat.

### Medium Effort (Semi-Automated)

- Use **LlamaIndex** or **LangChain** document loaders to load:
  - Markdown files
  - Web pages (e.g. docs URLs)
  - PDFs (if you have them)
- Chunk and embed with the same pipeline.
- Store in `knowledge_base` with `track_id` and `source`.

### Higher Effort (Full Automation)

- Scrape official docs (respect robots.txt and ToS).
- Use sitemaps or doc indexes to discover pages.
- Ingest periodically (e.g. weekly) to keep content fresh.

---

## 6. Quick Reference: What You Need

| Item | Recommendation |
|------|-----------------|
| **Vector DB** | pgvector (PostgreSQL extension) |
| **Embedding model** | OpenAI `text-embedding-3-small` (1536 dims) |
| **Chunk size** | 500–1000 tokens, 50–100 token overlap |
| **Top-K** | 5 for mentor chat |
| **Primary sources** | Curated markdown per track + `stage_content` |
| **Ingestion** | Script + optional trigger on stage content creation |

---

## 7. File Structure Suggestion

```
server/
  knowledge/                    # Curated content (markdown)
    llms/
    prompt_engineering/
    rag/
    ai_api_integration/
    ai_agents/
  scripts/
    ingest_knowledge.py         # Chunk, embed, insert
  app/
    ai_services/
      embedding_service.py      # Embed text(s)
      rag_service.py            # Retrieve + optional rerank
```

---

## 8. Next Steps

1. **Decide sources:** Start with 5–10 markdown files per track (manually curated).
2. **Add pgvector** (or keep TEXT + Python similarity for small scale).
3. **Implement embedding service** and ingestion script.
4. **Replace `search_knowledge_base`** mock with real vector search.
5. **Update `get_mentor_response`** to use retrieved context.
6. **Test** with real user questions in each track.

If you want, we can implement the embedding service and ingestion script next, or focus on a specific track first.
