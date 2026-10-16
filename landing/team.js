// The team section on the landing page. It stays hidden until `ceo` or at least
// one team below is filled in, so nothing appears that you haven't written.
//
// Photos: drop image files into landing/team/ and add `photo: "/landing/team/<file>"`
// to the person. Square or portrait, at least 600px wide, under ~300 KB. A person
// without a photo gets an initials avatar.
//
// Each `story` is plain text; a blank line starts a new paragraph.
window.GYMBOO_TEAM = {
  ceo: {
    name: "Sujal Das",
    role: "Founder & CEO",
    photo: "/landing/team/sujal-ceo.jpg",
    story:
      "Sujal Das is the Founder and CEO of GymBoo, driven by a passion for technology, problem-solving, and building practical software solutions. With a strong focus on solving real-world challenges through technology, he founded GymBoo to simplify gym operations and make professional gym management software more accessible and affordable for independent gym owners.\n\nHis vision is to empower fitness businesses with simple, reliable tools that reduce administrative work and help them focus on growth.",
  },
  teams: [
    {
      title: "Technical team",
      story:
        "Led by Deep Raj, the technical team builds and maintains the GymBoo apps, from the owner dashboard to the member check-in app. Their focus is on keeping the software simple, reliable and fast, so gym owners can depend on it every day.",
      members: [{ name: "Deep Raj", role: "Technical", photo: "/landing/team/deep-avatar.jpg" }],
    },
    {
      title: "Marketing",
      story:
        "Devansh leads marketing at GymBoo, helping independent gym owners discover a simpler way to run their business. He focuses on explaining what GymBoo does in plain terms and on bringing the product to the gyms that need it most.",
      members: [{ name: "Devansh", role: "Marketing", photo: "/landing/team/devansh-avatar.jpg" }],
    },
    {
      title: "Client engagement",
      story:
        "Rounak leads client engagement, working directly with gym owners to get them set up and comfortable with GymBoo. His focus is on listening to what each gym needs and making sure every owner feels supported after they start.",
      members: [{ name: "Rounak", role: "Client engagement", photo: "/landing/team/rounak-avatar.jpg" }],
    },
  ],
};
