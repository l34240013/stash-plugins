import sys
import json
import stashapi.log as log
from stashapi.stashapp import StashInterface

def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input:
            log.error("No input received from Stash.")
            return

        json_input = json.loads(raw_input)
        stash = StashInterface(json_input["server_connection"])

    except Exception as e:
        log.error(f"Initialization failed: {e}")
        return

    try:
        result = stash.call_GQL("{ findTags(filter: {per_page: -1}) { tags { id image_path } } }")
        tags = result.get("findTags", {}).get("tags", [])
    except Exception as e:
        log.error(f"Failed to fetch tags: {e}")
        return

    tags_to_clear = [t for t in tags if t.get("image_path")]
    total = len(tags_to_clear)

    if total == 0:
        log.info("No tag covers found to clear.")
        return

    mutation = "mutation($id: ID!) { tagUpdate(input: { id: $id, image: \"\" }) { id } }"
    for idx, tag in enumerate(tags_to_clear, 1):
        try:
            stash.call_GQL(mutation, {"id": tag["id"]})
        except Exception as e:
            log.error(f"Failed to clear tag {tag['id']}: {e}")
        log.progress(idx / total)

    log.info(f"Successfully cleared {total} tag cover images.")

if __name__ == "__main__":
    main()
