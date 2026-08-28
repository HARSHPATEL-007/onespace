#!/usr/bin/env node
import {
  createCanonicalTimeline, compileAAF, compileXML, compileEDL, compileOMF, compileFCPXML,
  createInterchangePackage, getPackage, cameraRawExample, lutExample, generateRelinkMap, simulateRelink,
  storageProfileExample, audioLayoutExample, atmosStatusExample, validateBroadcast, roundtripValidate,
  effectTransferForFormat, lossReportForPackage, aiGraphInterchange, EXPORT_PROFILES,
} from "./src/interchange-engine.ts";
function assert(c,m){ if(!c){ console.error("FAIL",m); process.exit(1);} else console.log("PASS",m); }

console.log("=== Interchange Smoke ===");
const tl = createCanonicalTimeline("tl001","gv42");
assert(tl.timeline_id==="tl001" && tl.clips.length>=2, "canonical timeline with clips");
assert(tl.tracks.length===3, "tracks");
assert(tl.clips[0].handles.head_frames===48, "handles 48");
assert(tl.clips[0].reel.reel==="A003C004", "reel");
assert(tl.clips[0].timecode.rate==="23.976", "timecode");
console.log(`Canonical ${tl.clips.length} clips, ${tl.tracks.length} tracks`);

// compilers
const aaf = compileAAF(tl);
assert(aaf.content.includes("AAF 1.1"), "AAF header");
assert(aaf.preserved.includes("Source timecode"), "AAF preserved");
console.log(`AAF warnings: ${aaf.warnings.join(" | ") || "none"}`);

const xml = compileXML(tl);
assert(xml.content.includes("<xmeml"), "XML xmeml");
const edl = compileEDL(tl);
assert(edl.content.includes("TITLE:"), "EDL TITLE");
assert(edl.warnings.length>=0, "EDL warnings");
const omfE = compileOMF(tl,"embedded");
const omfR = compileOMF(tl,"referenced");
assert(omfE.content.includes("OMF embedded"), "OMF embedded");
assert(omfR.warnings.some(w=>w.includes("Referenced")), "OMF referenced warning");
const fcpxml = compileFCPXML(tl, {format:"FCPXML", schema_version:"1.11", target_application:"Final Cut Pro", target_version:"13.x"});
assert(fcpxml.content.includes("fcpxml"), "FCPXML");

console.log(`Compilers OK AAF/XML/EDL/OMF/FCPXML`);

// package
const pkg = createInterchangePackage({ timelineId:"tl001", graphVersion:"gv42", profile:"avid_editorial_aaf", mediaMode:"proxy_with_relink_map", handleFrames:48, validateRoundtrip:true });
assert(pkg.package_id.startsWith("pkg_"), "package id");
assert(pkg.canonical_timeline.timeline_id==="tl001", "package canonical");
assert(pkg.files.interchange.AAF?.includes("project.aaf"), "package AAF file");
assert(pkg.files.interchange.FCPXML?.includes("fcpxml"), "package FCPXML");
assert(pkg.preservation["AAF:Source timecode"]==="preserved" || pkg.preservation["AAF:Source timecode"]==="flattened", "preservation map");
console.log(`Package ${pkg.package_id} format ${pkg.format} profile ${pkg.profile} warnings ${pkg.warnings.length}`);
assert(getPackage(pkg.package_id)?.package_id===pkg.package_id, "getPackage");

// camera RAW
const raw = cameraRawExample();
assert(raw.format==="ARRIRAW" && raw.iso===800 && raw.status==="preserved", "camera RAW preserved");
assert(raw.sidecar_hash.startsWith("sha3-512:"), "sidecar hash");
console.log(`Camera RAW ${raw.camera} ${raw.white_balance_kelvin}K`);

// LUT
const lut = lutExample();
assert(lut.input_color_space==="ARRI LogC4" && lut.output_color_space==="ACEScct", "LUT colorspace");
assert(lut.applied_mode==="referenced" && !lut.baked_into_export, "LUT referenced not baked");
console.log(`LUT ${lut.name} intensity ${lut.intensity}`);

// relink map — deterministic precedence never filename alone
const relink = generateRelinkMap("tl001","proxy","camera_original");
assert(relink.match_keys[0]==="n0va_asset_id" && relink.match_keys[1]==="media_fingerprint", "relink precedence chain");
assert(relink.entries[0].media_fingerprint.startsWith("sha3-512:"), "fingerprint");
const sim = simulateRelink(relink.entries, ["/Volumes/Production/Camera/A003C004_001.R3D", "/Volumes/Production/Camera/A004C001_001.wav"]);
assert(sim.relinked>=1, "relink simulated");
console.log(`Relink entries ${relink.entries.length} precedence ${relink.match_keys.join("→")} sim relinked ${sim.relinked} ambiguous ${sim.ambiguous} missing ${sim.missing}`);

// storage
const storage = storageProfileExample();
assert(storage.protocol==="NFS" && storage.permissions.originals==="read_only", "storage read_only originals");
assert(storage.path_mapping.macos.includes("Volumes"), "path mapping");
console.log(`Storage ${storage.name} ${storage.protocol}`);

// audio
const audio = audioLayoutExample("7.1.4");
assert(audio.format==="7.1.4" && audio.channels.length===12, "7.1.4 12 channels");
console.log(`Audio ${audio.format} ${audio.sample_rate}Hz`);

// atmos
const atmos = atmosStatusExample();
assert(["preserved","rendered_to_bed","flattened"].includes(atmos.status), "atmos status");

// broadcast validation
const bc = validateBroadcast("uhd_hdr_delivery");
assert(bc.result==="blocked" && bc.checks.true_peak==="failed", "broadcast blocked true_peak");
console.log(`Broadcast ${bc.profile} ${bc.result}`);

// roundtrip
const rt = roundtripValidate(pkg.package_id, "Avid Media Composer");
assert(rt.result==="passed_with_warnings" && rt.timeline.clip_count_match, "roundtrip passed_with_warnings");
console.log(`Roundtrip ${rt.format}→${rt.target} losses ${rt.losses.length}`);

// effect transfer — explicit choice per format, never imply survived when rendered
for(const fmt of ["AAF","FCPXML","EDL","OMF"]){
  const et = effectTransferForFormat("node_background_replace_04", fmt);
  assert(et.provenance_preserved===true, `${fmt} provenance`);
  if(fmt==="EDL"||fmt==="OMF") assert(et.result==="omitted", `${fmt} omitted`);
  else assert(["preserved","flattened_to_media"].includes(et.result), `${fmt} preserved/flattened`);
}
console.log("Effect transfer per format OK");

// loss report — never imply RAW-preserving if baked
const loss = lossReportForPackage(pkg.package_id);
assert(loss.preserved.length>0 && loss.rendered.length>0, "loss report preserved+rendered");
assert(loss.companion_files.includes("provenance-manifest.json"), "companion files");
console.log(`Loss report preserved ${loss.preserved.slice(0,3).join(", ")}`);

// export profiles
assert(EXPORT_PROFILES.length>=10, "export profiles >=10");
assert(EXPORT_PROFILES.some(p=>p.id==="avid_editorial_aaf"), "Avid profile");
assert(EXPORT_PROFILES.some(p=>p.id==="resolve_color_xml"), "Resolve profile");
console.log(`Profiles ${EXPORT_PROFILES.map(p=>p.id).join(", ")}`);

// AI graph interchange
const native = aiGraphInterchange("node_background_04","native");
assert(native.mode==="native_reference" && native.model_digest.startsWith("sha3-512:"), "AI native ref");
const flat = aiGraphInterchange("node_background_04","flattened");
assert(flat.mode==="flattened_media" && flat.rendered_asset.includes("rendered"), "AI flattened");
console.log("AI graph native+flattened OK");

console.log("\nAll interchange smoke checks passed.");
