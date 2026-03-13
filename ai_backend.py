"""
GRAVITY AI Backend — GPT-4o Powered Brain
Engine: OpenAI GPT-4o (vision + tool calling)
STT: OpenAI Whisper API
TTS: Edge TTS (free neural voice)
"""
import json
import base64
import io
import os
import tempfile
import edge_tts
from openai import OpenAI
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# ============================================================
# CONFIG
# ============================================================
API_KEY = os.environ.get("OPENAI_API_KEY", "")
MODEL = "gpt-4o"
WHISPER_MODEL = "whisper-1"
TTS_VOICE = "ru-RU-DmitryNeural"  # Edge TTS neural voice (free)

# ============================================================
# SYSTEM PROMPT — Personality of GRAVITY AI
# ============================================================
SYSTEM_PROMPT = """Ты — Gravity, встроенный ИИ-агент браузера Gravity. Ты дерзкий, саркастичный, остроумный помощник. Ты подкалываешь хозяина, троллишь его, используешь лёгкий мат и сленг, но при этом ИДЕАЛЬНО выполняешь любые команды.

ЛИЧНОСТЬ:
- Ты как лучший друг-гик: подъёбываешь, но всегда помогаешь
- Используешь сарказм, иронию, шутки
- Можешь материться легко (блять, сука, пиздец, ебать и тд)
- Никогда не извиняешься как корпоративный робот
- Твои ответы ВСЕГДА разные, уникальные, живые — никаких шаблонов

ПРАВИЛА РАБОТЫ:
1. Когда пользователь даёт команду (открой сайт, найди видео, кликни) — СНАЧАЛА вызови нужный инструмент, потом можешь пошутить
2. Когда пользователь спрашивает что ты видишь — опиши скриншот ДЕТАЛЬНО и точно
3. Когда пользователь просто болтает — отвечай в своём стиле, коротко и смешно
4. НИКОГДА не выдумывай URL. Если не знаешь точный адрес — используй google_search
5. Отвечай КОРОТКО (1-3 предложения максимум), если не просят подробностей
6. ВСЕ текстовые ответы на РУССКОМ языке"""

# ============================================================
# TOOLS DEFINITIONS (OpenAI Function Calling)
# ============================================================
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "open_website",
            "description": "Открыть определённый веб-сайт по URL. Используй ТОЛЬКО если знаешь ТОЧНЫЙ и ПРАВИЛЬНЫЙ URL. Для неизвестных сайтов используй google_search.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "Полный URL сайта (например https://youtube.com)"}
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "google_search",
            "description": "Поиск в Google. Используй когда пользователь хочет что-то найти или ты не знаешь точный URL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Поисковый запрос"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_youtube",
            "description": "Поиск видео на YouTube.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Что искать на YouTube"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "click_text",
            "description": "Кликнуть по элементу на странице, содержащему указанный текст.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Текст элемента для клика"}
                },
                "required": ["text"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "type_text",
            "description": "Ввести текст в поле ввода на странице.",
            "parameters": {
                "type": "object",
                "properties": {
                    "target_text": {"type": "string", "description": "Текст-подсказка или название поля ввода"},
                    "value": {"type": "string", "description": "Что напечатать в поле"}
                },
                "required": ["target_text", "value"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "scroll",
            "description": "Прокрутить страницу вверх или вниз.",
            "parameters": {
                "type": "object",
                "properties": {
                    "direction": {"type": "string", "enum": ["up", "down"], "description": "Направление прокрутки"}
                },
                "required": ["direction"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "go_back",
            "description": "Вернуться на предыдущую страницу в браузере.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "go_forward",
            "description": "Перейти вперёд в истории браузера.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
]

# ============================================================
# APP SETUP
# ============================================================
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = None  # Lazy init OpenAI client

def get_client():
    global client
    if client is None:
        key = API_KEY
        if not key:
            # Try loading from settings file
            try:
                settings_path = os.path.join(os.environ.get("APPDATA", ""), "gravity-browser", "settings.json")
                if os.path.exists(settings_path):
                    with open(settings_path, "r") as f:
                        settings = json.load(f)
                        key = settings.get("aiApiKey", "")
            except:
                pass
        if not key:
            raise ValueError("OpenAI API key not configured! Set OPENAI_API_KEY env var or configure in browser settings.")
        client = OpenAI(api_key=key)
    return client

# ============================================================
# MODELS
# ============================================================
from typing import Optional

class ChatRequest(BaseModel):
    text: str
    vision_base64: Optional[str] = None
    system_prompt: Optional[str] = ""

# ============================================================
# ENDPOINTS
# ============================================================

@app.post("/api/stt")
async def stt_handler(audio: UploadFile = File(...)):
    """Transcribe audio using OpenAI Whisper API — perfect Russian recognition"""
    try:
        content = await audio.read()
        print(f"[STT] Received audio: {len(content)} bytes")
        
        # Save to temp file (Whisper API needs a file)
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        tmp.write(content)
        tmp.close()
        
        try:
            c = get_client()
            with open(tmp.name, "rb") as audio_file:
                transcription = c.audio.transcriptions.create(
                    model=WHISPER_MODEL,
                    file=audio_file,
                    language="ru"
                )
            text = transcription.text.strip()
            print(f"[STT] Transcribed: {text}")
            return {"text": text}
        finally:
            os.unlink(tmp.name)
            
    except Exception as e:
        print(f"[STT ERROR] {e}")
        return {"text": ""}


@app.get("/api/tts")
async def tts_handler(text: str):
    """Generate premium voice using OpenAI TTS (onyx = deep male bass)"""
    try:
        c = get_client()
        response = c.audio.speech.create(
            model="tts-1",
            voice="onyx",
            input=text
        )
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
        tmp_path = tmp.name
        tmp.close()
        response.stream_to_file(tmp_path)
        return FileResponse(tmp_path, media_type="audio/mpeg", background=None)
    except Exception as e:
        print(f"[TTS ERROR] {e}")
        return {"error": str(e)}


@app.post("/api/chat")
async def chat_handler(req: ChatRequest):
    """GPT-4o with native vision + tool calling — the real deal"""
    try:
        c = get_client()
        system = req.system_prompt if req.system_prompt else SYSTEM_PROMPT
        
        # Build messages
        messages = [{"role": "system", "content": system}]
        
        # User message — with optional vision
        if req.vision_base64:
            # Strip data URI prefix
            img_data = req.vision_base64
            if "," in img_data:
                img_data = img_data.split(",", 1)[1]
            
            user_content = [
                {"type": "text", "text": req.text},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{img_data}",
                        "detail": "low"  # Fast processing, enough for UI understanding
                    }
                }
            ]
            messages.append({"role": "user", "content": user_content})
        else:
            messages.append({"role": "user", "content": req.text})
        
        # Call GPT-4o with tools
        print(f"[CHAT] Sending to GPT-4o: {req.text[:80]}...")
        response = c.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0.7,
            max_tokens=512
        )
        
        choice = response.choices[0]
        
        # Check if model wants to call tools
        if choice.message.tool_calls:
            # Return the FIRST tool call (GPT-4o usually calls one at a time for browser actions)
            tc = choice.message.tool_calls[0]
            tool_name = tc.function.name
            tool_args = json.loads(tc.function.arguments)
            
            # Also grab any text the model said alongside the tool call
            text_response = choice.message.content or ""
            
            print(f"[CHAT] Tool call: {tool_name}({tool_args})")
            return {
                "text": text_response,
                "tool_calls": [{
                    "name": tool_name,
                    "args": tool_args
                }]
            }
        else:
            # Pure text response
            text_response = choice.message.content or ""
            print(f"[CHAT] Text response: {text_response[:80]}...")
            return {
                "text": text_response,
                "tool_calls": []
            }
            
    except Exception as e:
        print(f"[CHAT ERROR] {e}")
        return {"text": f"Ошибка: {str(e)}", "tool_calls": []}


@app.get("/health")
async def health():
    """Check if OpenAI API is accessible"""
    try:
        c = get_client()
        # Quick test
        c.models.list()
        return {"status": "ok", "model": MODEL}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ============================================================
# ENTRY POINT
# ============================================================
if __name__ == "__main__":
    print('=' * 50)
    print('  GRAVITY AI SERVER (GPT-4o)')
    print(f'  Model: {MODEL}')
    print(f'  STT: {WHISPER_MODEL}')
    print(f'  TTS: {TTS_VOICE} (Edge, free)')
    print(f'  API: http://127.0.0.1:8000')
    print('=' * 50)
    
    # Quick API key check
    try:
        c = get_client()
        print("  [OK] OpenAI API key loaded")
    except Exception as e:
        print(f"  [WARN] API key not yet configured")
        print("  Set OPENAI_API_KEY env var or configure in browser settings")
        print("  Server will start anyway, key can be set later via /health endpoint")
    
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
