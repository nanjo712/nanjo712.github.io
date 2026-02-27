const Hexo = require('hexo');
const hexo = new Hexo(process.cwd(), {});

hexo.init().then(function(){
  hexo.load().then(function(){
    const post = hexo.locals.get('posts').data.find(p => p.title === '我是人');
    if (post) {
        console.log('--- Debug Info ---');
        console.log('Filename:', post.source);
        console.log('Raw Slug (Frontmatter):', post.slug);
        console.log('Generated Path:', post.path);
        console.log('Permalink Config:', hexo.config.permalink);
    } else {
        console.log('未找到文章，请检查标题');
    }
  });
});
