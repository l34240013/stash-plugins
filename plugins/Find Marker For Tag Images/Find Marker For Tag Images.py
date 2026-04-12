import sys
import json
import random
import time
import stashapi.log as log
from stashapi.stashapp import StashInterface

def main():
    try:
        input_data = json.loads(sys.stdin.read())
        stash = StashInterface(input_data["server_connection"])
    except Exception as e:
        log.error(f"Failed to initialize plugin connection: {e}")
        return

    start_time = time.time()

    tags_query = """
    query { findTags(tag_filter: {marker_count: {modifier: GREATER_THAN, value: 0}}, filter: {per_page: -1}) {
        tags { id name }
    }}
    """
    tags = stash.call_GQL(tags_query).get("findTags", {}).get("tags", [])

    if not tags:
        log.info("No tags with markers found.")
        return

    total = len(tags)
    log.info(f"Processing {total} tags via plugin...")

    for idx, tag in enumerate(tags, 1):
        tag_id = tag['id']

        marker_query = """
        query($id: ID!) { findSceneMarkers(scene_marker_filter: {tags: {value: [$id], modifier: INCLUDES}}, filter: {per_page: -1}) {
            scene_markers { id scene { id } }
        }}
        """
        markers = stash.call_GQL(marker_query, {"id": tag_id}).get("findSceneMarkers", {}).get("scene_markers", [])

        if markers:
            marker = random.choice(markers)
            server = input_data["server_connection"]
            base_url = f"{server.get('Scheme', 'http')}://{server.get('Host', 'localhost')}:{server.get('Port', 9999)}"
            stream_url = f"{base_url}/scene/{marker['scene']['id']}/scene_marker/{marker['id']}/stream"

            stash.call_GQL("mutation($id: ID!) { tagUpdate(input: { id: $id, image: \"\" }) { id } }", {"id": tag_id})
            stash.call_GQL("mutation($id: ID!, $img: String!) { tagUpdate(input: { id: $id, image: $img }) { id } }", {"id": tag_id, "img": stream_url})

        log.progress(idx / total)

        if idx % 10 == 0:
            elapsed = time.time() - start_time
            eta = int((elapsed / idx) * (total - idx))
            log.info(f"Progress: {idx}/{total} - ETA: {eta}s")

    log.info("Finished updating tag previews.")

if __name__ == "__main__":
    main()
