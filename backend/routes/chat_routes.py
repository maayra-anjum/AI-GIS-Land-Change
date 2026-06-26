import os
import requests as http_requests
from flask import Blueprint, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

bp = Blueprint("chat", __name__)
CORS(bp, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# Groq REST endpoint — uses requests, no new package needed
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.1-8b-instant"   # fast, free, capable


def build_system_prompt(context: dict) -> str:
    no_change        = context.get("no_change", 0)
    change           = context.get("change", 0)
    demolished       = context.get("demolished", 0)
    start_year       = context.get("start_year", "unknown")
    end_year         = context.get("end_year", "unknown")
    total_areas      = context.get("total_areas", 0)
    changed_areas    = context.get("changed_areas", 0)
    demolished_areas = context.get("demolished_areas", 0)
    no_change_areas  = context.get("no_change_areas", 0)
    bounds           = context.get("bounds", None)

    bounds_str = ""
    if bounds and len(bounds) == 2:
        try:
            bounds_str = (
                f"Geographic bounds: Lat [{bounds[0][0]:.4f} to {bounds[1][0]:.4f}], "
                f"Lng [{bounds[0][1]:.4f} to {bounds[1][1]:.4f}]."
            )
        except Exception:
            pass

    return f"""You are an expert land change analyst and environmental consultant AI assistant.
You have been given the results of an AI-powered satellite land change detection analysis.
Your ONLY job is to give real, specific, actionable RECOMMENDATIONS based on these exact numbers.

=== ANALYSIS RESULTS ===
Period analyzed: {start_year} → {end_year}
Total analyzed zones: {total_areas}

Land Change Breakdown:
- No Change:  {no_change:.1f}%  ({no_change_areas} zones)
- Change:     {change:.1f}%  ({changed_areas} zones)
- Demolished: {demolished:.1f}%  ({demolished_areas} zones)
{bounds_str}

=== YOUR RULES ===
1. Always give RECOMMENDATIONS first — not explanations
2. Cite exact percentages in every recommendation
3. Use this severity guide:
   - Change > 30%: Urgent urban management intervention needed
   - Change 15-30%: Moderate monitoring and planning required
   - Change < 15%: Routine monitoring sufficient
   - Demolished > 20%: Emergency assessment and redevelopment planning
   - Demolished 5-20%: Investigate cause, document affected areas
   - Demolished < 5%: Note and monitor
4. Structure every response as numbered recommendations
5. Keep each recommendation to 1-2 sentences — direct and actionable
6. Do not give generic advice — every point must reference the actual numbers
7. Stay focused on land change analysis only
"""


@bp.route("/chat", methods=["POST", "OPTIONS"])
def chat():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    if not GROQ_API_KEY:
        return jsonify({
            "error": "Groq API key not configured. Add GROQ_API_KEY to backend .env"
        }), 500

    try:
        data         = request.get_json()
        user_message = data.get("message", "").strip()
        context      = data.get("context", {})
        history      = data.get("history", [])  # [{role, text}, ...]

        if not user_message:
            return jsonify({"error": "No message provided"}), 400

        system_prompt = build_system_prompt(context)

        # Build messages array for Groq (OpenAI-compatible format)
        messages = [{"role": "system", "content": system_prompt}]

        # Add conversation history (last 10 turns)
        for item in history[-10:]:
            role = "user" if item.get("role") == "user" else "assistant"
            messages.append({"role": role, "content": item.get("text", "")})

        # Add current user message
        messages.append({"role": "user", "content": user_message})

        payload = {
            "model": GROQ_MODEL,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 1024,
        }

        response = http_requests.post(
            GROQ_URL,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {GROQ_API_KEY}",
            },
            timeout=30,
        )

        if response.status_code != 200:
            error_body = response.json()
            error_msg  = error_body.get("error", {}).get("message", response.text)
            return jsonify({"error": f"Groq API error: {error_msg}"}), 500

        result = response.json()
        reply  = result["choices"][0]["message"]["content"].strip()

        return jsonify({"reply": reply})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Server error: {str(e)}"}), 500
