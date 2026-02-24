import pkg from "stremio-addon-sdk";
//import { serveHTTP } from "stremio-addon-sdk";
//import axios from "axios";
const { addonBuilder, serveHTTP } = pkg;

//import { addonBuilder, serveHTTP } from "stremio-addon-sdk";
import axios from "axios";
const addon_username = "erik612"
const addon_password = "filmykodi"
let addon_cookie = ""

const builder = new addonBuilder({
    id: 'Fastshare',
    version: '1.0.0',
    name: 'Fastshare.cz',
    description: "Fastshare stream",
    logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRSazc17OuOQwaf_PFnVkEYhqRERW1haYBftQ&s.png",
    // Properties that determine when Stremio picks this addon
    // this means your addon will be used for streams of the type movie
    resources: ['catalog', 'stream', 'meta'],
    types: ['movie', 'series'],
    catalogs: [
        {
            type: "movie",
            id: "fastshare",
            name: "Fastshare videos",
            extra: [
                //{ name: "search", isRequired: false }  // ← toto je dôležité
                { name: "search"}  // ← toto je dôležité
            ]
        }
    ],
    idPrefixes: ['tt', "fastshare"]
}
)

// takes function(args)
builder.defineStreamHandler(async function(args) {
    //console.log("!!!!!defineStreamHandler: ", args)
    let streams = []
    if(args.id.startsWith("tt"))
    {
        let id = args.id.split(":")[0]
        let url = `https://api.themoviedb.org/3/find/${id}?api_key=a07324c669cac4d96789197134ce272b&external_source=imdb_id&language=sk-SK,cs-CS&append_to_response=credits,images,release_dates,videos`
        let response = await axios.get(url)
        let query = response.data?.movie_results[0]
        ? `${response.data.movie_results[0].original_title} ${response.data.movie_results[0].release_date.substring(0, 4)}`
        : `${response.data.tv_results[0].name} s${args.id.split(":")[1].padStart(2, "0")}e${args.id.split(":")[2].padStart(2, "0")}`;
        //query = response.data?.movie_results[0] ? `${response.data.movie_results[0].title} ${response.data.movie_results[0].release_date.substring(0, 4)}` : `${response.data.tv_results[0].original_name} s${args.id.split(":")[1]}e${args.id.split(":")[2]}` 
        let files = await search(query, false)
        streams = files.map(file => ({
            name:  `${file.resolution ? `📺${file.resolution.match(/x(\d+)/i)[1]}p  ` : "" }${file.size ? `💾${file.size}   ` : ""}`, //|| file.name,               // napr. 1080p, fallback na názov
            url: file.d_link,                                 // link na prehratie
            description: `${file.name.replaceAll(/ /g, "\u00A0").replace(/\s+(?=\S*$)/, ".")}\n${file.duration ? "⏱" + file.duration : ""}\n${file.audio?.audio_stopy ? "🔊" + file.audio.audio_stopy.split(/\s+/).join("|").replaceAll(",","")  : ""}\n${file.video?.titulky ? "💬" + file.video.titulky.split(/\s+/).join("|").replaceAll(",","") : "" }`,
            thumbnail: file.thumbnail,
            type: "movie",
            behaviorHints: {
                notWebReady: true,
                proxyHeaders: {
                    request: {
                    Cookie: addon_cookie
                    }}}
            }))       
        
    }
    else //vysledky vyhladavania jednotlivych suborov
    {
        streams = [
        {
            //name: "_______"+args.id.split(";")[1],
            url: args.id.split(";")[0].replace("fastshare:", ""),
            //description: "test",
            behaviorHints: {
            notWebReady: true,
            proxyHeaders: {
                request: {
                Cookie: addon_cookie
                }
            }
            }
        }]
    }
    //console.log("streams:", streams)
    return { streams }
})

builder.defineCatalogHandler(async function(args) {
    let files = await search(args.extra.search)
    //console.log("files", files) 

    //console.log("POSTER", files[0].thumbnail) 
    const metas = files.map(f => ({
        id: `fastshare:${f.d_link};${f.name};${f.thumbnail};${f.audio?.audio_stopy? `🔊`+f.audio.audio_stopy.replaceAll(",", "|"): ""};${f.video?.titulky? `💬`+f.video.titulky.replaceAll(",", "|"): ""}`,
        name: f.name,
        poster: (!f.thumbnail || f.thumbnail.toLowerCase().includes("/images/icons")) ? ("https://fastshare.cloud/" + f.thumbnail) : f.thumbnail,
        //"posterShape": "regular",
        description: f.name || "",
        type: "movie"
    }))
    //console.log("METAS:", metas)
    return { "metas": metas }
})

builder.defineMetaHandler(function(args) {
    console.log("defineMetaHandler_args:", args)
    console.log("defineMetaHandler_args:", args.id)

    const metaObj = {
        id: args.id,
        //id: "Fastshare:https://data8.fastshare.cloud/download.php?id=30442602",
        name: args.id.split(";")[1],
        description: `${args.id.split(";")[3]}\n${args.id.split(";")[4]}`,
        //releaseInfo: '2010',
        background: args.id.split(";")[2],
        poster: args.id.split(";")[2],
        posterShape: 'poster',
        type: 'movie'
    }
    return Promise.resolve({ meta: metaObj })
})

function make_term(query) {
    // 1. do lowercase
    let cleaned = query.toLowerCase()
        // 2. odstráni diakritiku (normalize + regex)
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        // 3. odstráni nepísmená/písmená s diakritikou okrem čísiel a medzier
        .replace(/[^a-z0-9 ]+/g, "")
        // 4. zmenší viacnásobné medzery
        .replace(/\s+/g, " ")
        .trim();

    // 5. Base64 bez paddingu
    let s = Buffer.from(cleaned, "utf-8").toString("base64");
    return s.replace(/=+$/, "");
}

async function login() {
    try {
        const url = `https://fastshare.cz/api/api_kodi.php?process=login&login=${addon_username}&password=${addon_password}`
        const res = await axios.get(url)
        addon_cookie = "FASTSHARE=" + res.data.user.hash
        //console.log("✅ Fastshare login OK, hash:", addon_cookie)
    } catch (err) {
        console.error("❌ Fastshare login error:", err.message)
    }
}

async function get_html(url, addon_cookie) {
    console.log(url)
    try {
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                          "AppleWebKit/537.36 (KHTML, like Gecko) " +
                          "Chrome/127.0.0.0 Safari/537.36"
        }

        if (addon_cookie) {
            //headers["Cookie"] = `FASTSHARE=${cookie}`
            headers["Cookie"] = addon_cookie
        }

        const response = await axios.get(url, {
            headers: headers,
            timeout: 10000, // 10 sekúnd
            responseType: "text"
        })
        return response.data

    } catch (error) {
        // ak je k dispozícii odpoveď servera
        if (error.response) {
            console.error("Status:", error.response.status, error.response.statusText);
            console.error("Headers:", error.response.headers);
            console.error("Data:", error.response.data);   // môže byť HTML alebo JSON
        } 
        // ak bol odoslaný request ale neprišla odpoveď
        else if (error.request) {
            console.error("No response received. Request:", error.request);
        } 
        // iná chyba (napr. chyba v konfigurácii)
        else {
            console.error("Other error:", error);
        }
    }
}

async function file_details(d_link) {
    let html = await get_html(d_link)  // ⚠️ async/await – musíš byť v async funkcii
    let footerMatch = html.match(/<div class="video-footer".*?<\/div>\s*<\/div>/is)
    let footer_html = footerMatch ? footerMatch[0] : ""

    // --- VIDEO ---
    const video_info = footer_html.match(/<b>Video:<\/b><br>(.*?)<td/is)
    let video_props = null

    if (video_info) {
        const v_raw = video_info[1].trim().replace(/<br>/g, "\n")

        const kodekMatch   = v_raw.match(/Kodek:\s*(.*)/i)
        const bitrateMatch = v_raw.match(/Bitrate:\s*(.*)/i)
        const fpsMatch     = v_raw.match(/Počet sním(?:ků|ok) (?:za (?:vt|s)eřinu|za sekundu):\s*(.*)/i)

        video_props = {
            kodek:   kodekMatch   ? kodekMatch[1].trim()   : null,
            bitrate: bitrateMatch ? bitrateMatch[1].trim() : null,
            fps:     fpsMatch     ? fpsMatch[1].trim()     : null,
        }

        const subs_match = footer_html.match(/<b>\s*Titulky\s*:\s*<\/b>\s*([^<\r\n]*)/i)
        const subs_langs = subs_match ? subs_match[1].trim() : ""
        video_props.titulky = (subs_langs || "")
        .replace(/česky|ces|čes|czech|cz|cesk(y|á)/gi, "CZ")
        .replace(/slovensk(y|o|á)|slo|slovak|slk|svk/gi, "SK")
        .replace(/anglick(y|y|á)|eng|en/gi, "EN")
    }

    // --- AUDIO ---
    const audio_info = footer_html.match(/<b>Audio:<\/b><br>(.*?)<td/is)
    let audio_props = null

    if (audio_info) {
        const a_raw = audio_info[1].trim().replace(/<br>/g, "\n")

        const kodekMatch   = a_raw.match(/Kodek:\s*(.*)/i)
        const kanalyMatch  = a_raw.match(/Počet kanálů:\s*(.*)/i)
        const layoutMatch  = a_raw.match(/Layout:\s*(.*)/i)
        const bitrateMatch = a_raw.match(/Bitrate:\s*(.*)/i)

        audio_props = {
            kodek:   kodekMatch   ? kodekMatch[1].trim()   : null,
            kanaly:  kanalyMatch  ? kanalyMatch[1].trim()  : null,
            layout:  layoutMatch  ? layoutMatch[1].trim()  : null,
            bitrate: bitrateMatch ? bitrateMatch[1].trim() : null,
        }

        const audio_match = footer_html.match(/<b>\s*Audio stopy\s*:\s*<\/b>\s*([^<\r\n]*)/i)
        const audio_langs = audio_match ? audio_match[1].trim() : ""
        //audio_props.audio_stopy = audio_langs || ""
        audio_props.audio_stopy = (audio_langs || "")
        .replace(/česky|ces|čes|czech|cz|cesk(y|á)/gi, "CZ")
        .replace(/slovensk(y|o|á)|slo|slovak|slk|svk/gi, "SK")
        .replace(/anglick(y|y|á)|eng|en/gi, "EN")
        .replaceAll(",", "")
    }
    // console.log(video_props, audio_props) 
    return [video_props, audio_props]
}

//async function search(query, video_details = true)
// {
//     //console.log("query: ", query)
// 	let files = []
//     let html = await get_html(`https://fastshare.cloud/${query.replaceAll(" ", "-")}/s`)
// 	if (!html && html != null) 
// 	{
// 		console.log(html)
// 	    const match = html.toString().match(/id="search_token"\s*value="([^"]+)"/)
// 	    const token = match ? match[1] : null
// 	    let limit = 1
// 	    let items = []
// 	    while (true) {
// 	        url =   `https://fastshare.cloud/test2.php?` +
// 	                `token=${token}&` +
// 	                `&search_purpose=0&search_resolution=0&order=&type=video` +
// 	                `&term=${make_term(query)}&plain_search=0&limit=${limit}&step=3`
	        
// 	        html = await get_html(url, addon_cookie)
// 	        const regex = /<li\b[^>]*>([\s\S]*?)<\/li>/gi
// 	        const new_items = [...html.matchAll(regex)].map(m => m[1])
	
// 	        if (new_items.length==0)
// 	            break
// 	        else
// 	        {
// 	            items = items.concat(new_items)
// 	            limit+=9
// 	        }
// 	    }
// 	    const start = Date.now()
// 	    if (!items[0]?.includes("nebylo nic nalezeno") && items.length != 0) {
// 	        for (const li of items) {
// 	            // názov súboru
// 	            let fileNameMatch = li.match(/<div[^>]*class="video_detail"[^>]*>.*?<p[^>]*>\s*<a[^>]*>(.*?)<\/a>/is)
// 	            let file_name = fileNameMatch ? fileNameMatch[1].trim() : "(NO NAME)"
// 	            let file_name_lower = file_name.toLowerCase()
	
// 	            let audio = []
// 	            audio.audio_stopy = ""
// 	            let video = []
// 	            video.titulky = ""
// 	            if ((file_name_lower.includes("sk") || file_name_lower.includes("sl")) && !file_name_lower.includes("česk") && !file_name_lower.includes("cesk")) 
// 	                audio.audio_stopy = "SK"
// 			    if (file_name_lower.includes("cz") || file_name_lower.includes("cs") || file_name_lower.includes("český") || file_name_lower.includes("cesky")) 
// 	                audio.audio_stopy = audio.audio_stopy? audio.audio_stopy + " CZ" : "CZ"
// 	            // if (file_name_lower.includes("en") || file_name_lower.includes("eng") || file_name_lower.includes("english") || file_name_lower.includes("cesky")) 
// 	            //     audio.audio_stopy = audio.audio_stopy? audio.audio_stopy + " EN" : "EN"
	
// 	            // rýchle stiahnutie link
// 	            let dlMatch = li.match(/<a[^>]*href=["']([^"']+)["'][^>]*title=["']Rychlé stažení["']/i)
// 	            let dl_href = dlMatch ? dlMatch[1].trim() : null
	
// 	            // detaily videa
// 	            let video_detail_matches = [...li.matchAll(/<span[^>]*class="[^"]*\bvideo_time\b[^"]*"[^>]*>(.*?)<\/span>/gis)].map(m => m[1])
// 	            let durationMatch = video_detail_matches.length > 0 ? video_detail_matches[0].match(/(\d{1,2}:\d{2}:\d{2})/) : null
// 	            let duration = durationMatch ? durationMatch[1] : null
// 	            let resolution = video_detail_matches.length > 1 ? video_detail_matches[1].trim().split(";").pop().trim() : null
// 	            let size = video_detail_matches.length > 3 ? video_detail_matches[3].trim() :
// 	            video_detail_matches.length > 2 ? video_detail_matches[2].trim() : null
	
// 	            // odkaz a thumbnail
// 	            let aMatch = li.match(
// 	                /<div[^>]*class="[^"]*\bvideo\b[^"]*"[^>]*>\s*<a[^>]*href=([^\s>]+)[^>]*>\s*<img[^>]*src=["']([^"']+)["']/is
// 	            )
// 	            let d_link = aMatch ? aMatch[1].trim() : null
// 	            let img_src = aMatch ? aMatch[2].trim() : null
	
// 	            // načítanie detailov videa
// 	            //video, audio = details? await file_details(d_link): video, audio
// 	            if (video_details == true)
// 	            {
// 	                details = await file_details(d_link)
// 	                audio_details = details[1]?.audio_stopy? details[1].audio_stopy.split(" ") : null
// 	                if (audio_details != null)
// 	                    for (const lang of audio_details) {
// 	                        if (!audio.audio_stopy.includes(lang)) {
// 	                            // ak tam ešte nie je, pridaj
// 	                            audio.audio_stopy += (audio.audio_stopy ? " " : "") + lang
// 	                        }
// 	                    }
// 	                //audio.audio_stopy += details[1]?.audio_stopy? " " + details[1].audio_stopy : ""
// 	                video_details = details[0]?.titulky? details[0].titulky.split(" ") : null
// 	                if (video_details != null)
// 	                    for (const lang of video_details) {
// 	                        if (!video.titulky.includes(lang)) {
// 	                            // ak tam ešte nie je, pridaj
// 	                            video.titulky += (video.titulky ? " " : "") + lang
// 	                        }
// 	                    }
// 	                video.titulky += details[0]?.titulky? details[0].titulky : ""
// 	            }
	
// 	            let file = {
// 	                name: file_name,
// 	                size: size,
// 	                duration: duration,
// 	                resolution: resolution,
// 	                thumbnail: img_src,
// 	                d_link: dl_href,
// 	                video: video,
// 	                audio: audio
// 	            }
// 	            files.push(file)
// 	        }
// 	    }
// 	}
//     return files
// }

async function search(query, video_details = true)
{
    //console.log("query: ", query)
	let files = []
	let videos = []
	let url = "https://fastshare.cz/api/api_kodi.php?process=search&term=sonic"
	const response = await axios.get(url, {
			  headers: 
			  {
				  "User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
				  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
				  "Accept-Language": "en-US,en;q=0.9,sk;q=0.8",
				  "Referer": "https://fastshare.cz/",
				  "Connection": "keep-alive"
			  }
			});
	if (response.status == 200)
	{
		videos = response.data.items
		console.log(response)
		console.log(videos)
		if (videos.length != 0) {
	        for (const video of videos) {
	            let audio = []
	            audio.audio_stopy = ""
	            video_title_lower = video.title.toLowerCase()
	            if (video_title_lower.includes("sk") && !video_title_lower.includes("česk") && !video_title_lower.includes("cesk")) 
	                audio.audio_stopy = "SK"
			    if (video_title_lower.includes("cz") || video_title_lower.includes("cs") || video_title_lower.includes("český") || video_title_lower.includes("cesky")) 
	                audio.audio_stopy = audio.audio_stopy? audio.audio_stopy + " CZ" : "CZ"
	
	            objectType = video.objectType.toLowerCase()
	            let file = {
	                name: video.title,
	                size: `${(video.size / (1024 ** 3)).toFixed(2)} GB`,
	                duration: `${Math.floor(video.duration / 3600)}h ${Math.floor((video.duration % 3600) / 60)}m`,
	                //resolution: resolution,
	                thumbnail: video.thumbs[0],
	                d_link: `https://api.hellspy.to/${objectType.substring(0, 2)}/${objectType.slice(-5)}/${video.id}/${video.fileHash}/download`,
	                audio: audio
	            }
	            files.push(file)
	        }
	    }
	}
	else
		console.log("response BAD")
	
	    
	return files
}

// // Najskôr login, potom spustenie servera
// async function init() {
//     await login()
//     //const server = serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 })
// }
// init()

await login()
serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });

























