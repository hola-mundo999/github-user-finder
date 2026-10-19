
//search button
let searchBtn = document.getElementById("search-btn");

searchBtn.addEventListener("click", function(){
    // getting the username form  the input field
    let usernameInput = document.getElementById("username-input").value.trim();
    console.log(usernameInput);


    fetchGitHubUser(usernameInput);




})



//fetch api get the real data from github api
async function fetchGitHubUser(usernameInput){
    try{
        // show loading state
        document.getElementById("loading").removeAttribute("hidden");
        let response = await fetch(`https://api.github.com/users/${usernameInput}`);
        if(!response.ok){
            throw new Error("user not found");
        }
        let data = await response.json();
        // remove the loading state
        document.getElementById("loading").setAttribute("hidden", true);
        // show the profile card
        document.getElementById("profile-card").removeAttribute("hidden");
        // show the image of profile
        document.getElementById("avatar").src = data.avatar_url;
        //profile name
        document.getElementById("profile-name").textContent = data.name || "No name provided";
        //profile login username
        document.getElementById("profile-login").textContent = `@${data.login}`;
        //profile bio
        document.getElementById("profile-bio").textContent = data.bio || "No bio provided";
        // public repo
        document.getElementById('stat-repos').textContent = data.public_repos;
        //followers
        document.getElementById('stat-followers').textContent = data.followers;
        //following
        document.getElementById('stat-following').textContent = data.following;
        //location
        document.getElementById('location-text').textContent = data.location || "No location provided";
        // blog text
        document.getElementById('blog-text').textContent = data.blog || 'Not available';
        //joined text
        document.getElementById('joined-text').textContent = 'Joined ' + new Date(data.created_at).toDateString();
        //company
        document.getElementById('company-text').textContent = data.company || 'Not available';
        //view button
        document.getElementById('view-btn').setAttribute('href', data.html_url);


        console.log(data);

    }catch(error){
        console.error("Error fetching user data:", error);
        document.getElementById("loading").setAttribute("hidden", true);
        //show thw error box
        document.getElementById("error-box").removeAttribute("hidden");
        // hide the error box after 3 seconds
        setTimeout(function(){
        document.getElementById("error-box").setAttribute("hidden", true);
        }, 5000);

    }
}

